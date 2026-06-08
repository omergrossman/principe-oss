// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-auth";
import { createInvite, listPendingInvites } from "@/lib/invites/repo";

/** Resolve the user-facing accept URL from the request origin. */
function acceptUrl(req: NextRequest, token: string): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    "localhost:3000";
  return `${proto}://${host}/accept-invite?token=${token}`;
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

export async function POST(req: NextRequest) {
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

    const link = acceptUrl(req, invite.token);

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
