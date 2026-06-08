// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * /api/auth/recover — email-link recovery for lost passkeys.
 *
 * V1 implementation: validates the email, generates a single-use recovery
 * token, persists it as an Invitation row with a 24h TTL, and logs the
 * recovery URL to console. Sprint 2 wires real email delivery (Resend or
 * SES) per `docs/runbook-email-delivery.md` (TBD).
 *
 * Always returns 200 to avoid email-existence enumeration. The actual
 * delivery (or non-delivery) is the differentiating signal.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Body {
  email?: unknown;
}

function randomToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Buffer.from(buf).toString("base64url");
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: true });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { take: 1 } },
  });

  if (user && user.memberships.length > 0) {
    const membership = user.memberships[0];
    const token = randomToken();
    await prisma.invitation.create({
      data: {
        firmId: membership.firmId ?? "",
        portcoId: membership.portcoId,
        email,
        role: membership.role,
        invitedById: user.id,
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const recoveryUrl = `${process.env.WEBAUTHN_ORIGIN}/recover/redeem?token=${token}`;
    // V1: log to console. Sprint 2: real email via Resend/SES.
    console.log(`[auth/recover] recovery link for ${email}: ${recoveryUrl}`);
  }

  return NextResponse.json({ ok: true });
}
