import { NextRequest, NextResponse } from "next/server";
import { consumeInvite } from "@/lib/invites/repo";
import { createSession } from "@/lib/session";

/**
 * POST /api/auth/accept-invite — consume an invite token.
 *
 * Body: { token, displayName? }
 * On success: creates the user + membership, opens a session, returns
 *   { ok: true, redirectTo: "/onboarding/enroll-passkey" }
 * On expired/invalid: 400 with a user-readable error.
 *
 * The passkey enrollment step still runs after this — this endpoint just
 * mints the bootstrap session so the enrollment flow has a logged-in
 * user to attach the passkey to.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const displayName =
    typeof body?.displayName === "string" ? body.displayName : undefined;

  if (!token) {
    return NextResponse.json({ error: "Invite token missing." }, { status: 400 });
  }

  try {
    const result = await consumeInvite(token, { displayName });
    await createSession({
      userId: result.userId,
      membershipId: result.membershipId,
      firmId: result.firmId,
      portcoId: null,
      role: result.role,
    });
    return NextResponse.json({
      ok: true,
      redirectTo: "/onboarding/enroll-passkey",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not accept invite.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
