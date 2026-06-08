// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-auth";
import { createInvite, listPendingInvites } from "@/lib/invites/repo";

/**
 * Resolve the user-facing accept URL from the CONFIGURED origin, never from
 * request headers. Building it from x-forwarded-host/host lets an attacker
 * who can influence those headers mint invite links (carrying a valid token)
 * that point at a host they control — a token-leak vector. WEBAUTHN_ORIGIN is
 * the one canonical, operator-set origin the app is reachable from.
 */
function acceptUrl(token: string): string {
  const origin = process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3000";
  return `${origin.replace(/\/$/, "")}/accept-invite?token=${token}`;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session.firmId) {
    return NextResponse.json({ error: "Organisation required" }, { status: 403 });
  }
  const invites = await listPendingInvites(session.firmId);
  return NextResponse.json({
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role === "VC_ADMIN" ? "ADMIN" : "MEMBER",
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session.firmId) {
    return NextResponse.json({ error: "Organisation required" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email : "";
  const role =
    body?.role === "ADMIN" || body?.role === "MEMBER" ? body.role : "MEMBER";

  try {
    const invite = await createInvite({
      firmId: session.firmId,
      invitedById: session.userId,
      email,
      role,
    });

    const link = acceptUrl(invite.token);

    // OSS distribution: email delivery is removed. The admin gets the
    // accept link back in the response and shares it with the invitee
    // through whatever channel they prefer (DM, Slack, paper).
    return NextResponse.json({
      ok: true,
      invite: {
        id: invite.id,
        email: invite.email,
        role,
        expiresAt: invite.expiresAt.toISOString(),
      },
      link,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create invite.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
