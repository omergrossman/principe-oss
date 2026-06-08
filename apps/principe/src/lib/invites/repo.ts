// SPDX-License-Identifier: AGPL-3.0-or-later
import { prisma } from "@/lib/db/prisma";
import type { WorkspaceRole } from "@prisma/client";
import { assertAdminSlotAvailable } from "@/lib/bootstrap/admin-quota";

/**
 * Invite repository — admin-side member invitations and member-side
 * acceptance. The Invitation table itself was already in the schema;
 * this is the V1 wiring.
 */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CreateInviteInput {
  firmId: string;
  invitedById: string;
  email: string;
  role: "ADMIN" | "MEMBER"; // V1 vocabulary; mapped to WorkspaceRole below.
}

export interface InviteRecord {
  id: string;
  email: string;
  role: WorkspaceRole;
  token: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

function randomToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Buffer.from(buf).toString("base64url");
}

function mapRole(role: "ADMIN" | "MEMBER"): WorkspaceRole {
  // V1 collapses to two roles. PORTCO_FOUNDER is the existing
  // schema enum that maps cleanly to "member" semantics.
  return role === "ADMIN" ? "VC_ADMIN" : "PORTCO_FOUNDER";
}

export async function createInvite(
  input: CreateInviteInput,
): Promise<InviteRecord> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new Error("Please enter a valid email.");
  }
  if (input.role === "ADMIN") {
    await assertAdminSlotAvailable(input.firmId);
  }

  // Reject if there's already an un-consumed, un-expired invite for this
  // (firm, email) pair — avoids duplicate links floating around.
  const now = new Date();
  const existingOpen = await prisma.invitation.findFirst({
    where: {
      firmId: input.firmId,
      email,
      acceptedAt: null,
      expiresAt: { gt: now },
    },
  });
  if (existingOpen) {
    throw new Error(
      "An active invite already exists for this email. Revoke it first if you want to issue a new one.",
    );
  }

  // Reject if the email is already a member of this firm.
  const existingMember = await prisma.user.findUnique({
    where: { email },
    include: {
      memberships: { where: { firmId: input.firmId }, take: 1 },
    },
  });
  if (existingMember && existingMember.memberships.length > 0) {
    throw new Error("That email is already a member of this organisation.");
  }

  const token = randomToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const created = await prisma.invitation.create({
    data: {
      firmId: input.firmId,
      email,
      role: mapRole(input.role),
      invitedById: input.invitedById,
      token,
      expiresAt,
    },
  });
  return created;
}

export async function listPendingInvites(
  firmId: string,
): Promise<InviteRecord[]> {
  const now = new Date();
  return prisma.invitation.findMany({
    where: {
      firmId: firmId,
      acceptedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeInvite(
  firmId: string,
  inviteId: string,
): Promise<void> {
  const invite = await prisma.invitation.findFirst({
    where: { id: inviteId, firmId: firmId },
  });
  if (!invite) throw new Error("Invite not found.");
  if (invite.acceptedAt) throw new Error("Invite already accepted.");
  await prisma.invitation.delete({ where: { id: invite.id } });
}

export async function getInviteByToken(
  token: string,
): Promise<
  | (InviteRecord & { firmName: string; firmId: string })
  | null
> {
  const invite = await prisma.invitation.findUnique({
    where: { token },
    include: { firm: { select: { name: true, id: true } } },
  });
  if (!invite) return null;
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    token: invite.token,
    expiresAt: invite.expiresAt,
    acceptedAt: invite.acceptedAt,
    createdAt: invite.createdAt,
    firmName: invite.firm.name,
    firmId: invite.firm.id,
  };
}

/**
 * Consume the invite: creates the User (if new) and the Membership,
 * marks the invite accepted. Returns the resolved user + membership.
 */
export async function consumeInvite(
  token: string,
  opts: { displayName?: string } = {},
): Promise<{
  userId: string;
  email: string;
  displayName: string;
  membershipId: string;
  firmId: string;
  role: WorkspaceRole;
}> {
  const invite = await prisma.invitation.findUnique({
    where: { token },
    include: { firm: { select: { id: true } } },
  });
  if (!invite) throw new Error("Invite not found.");
  if (invite.acceptedAt) throw new Error("Invite already accepted.");
  if (invite.expiresAt < new Date()) {
    throw new Error("Invite has expired. Ask your admin for a new one.");
  }

  // Re-check the admin cap at consume time too — pending invites are
  // counted in the quota, but defensive double-check guards against
  // schema/cap changes after the invite was issued.
  if (invite.role === "VC_ADMIN") {
    await assertAdminSlotAvailable(invite.firm.id).catch((e) => {
      throw new Error(
        e instanceof Error
          ? e.message
          : "Admin quota exceeded — contact your admin.",
      );
    });
  }

  const email = invite.email;
  const displayName = (opts.displayName?.trim() || "").slice(0, 60);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      update: displayName ? { name: displayName } : {},
      create: { email, name: displayName || null },
    });

    // Don't double-add a membership if one somehow already exists.
    const existing = await tx.membership.findFirst({
      where: {
        userId: user.id,
        firmId: invite.firm.id,
        portcoId: null,
      },
    });
    const membership = existing
      ? await tx.membership.update({
          where: { id: existing.id },
          data: { role: invite.role },
        })
      : await tx.membership.create({
          data: {
            userId: user.id,
            firmId: invite.firm.id,
            role: invite.role,
          },
        });

    await tx.invitation.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    return {
      userId: user.id,
      email: user.email,
      displayName: user.name ?? email,
      membershipId: membership.id,
      firmId: invite.firm.id,
      role: invite.role,
    };
  });
}
