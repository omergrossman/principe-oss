// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from "next/server";
import { generateAuthOptions, verifyAuthResponse } from "@principe/rbac";
import {
  setAuthenticationChallenge,
  getAuthenticationChallenge,
  clearAuthenticationChallenge,
  getPasskey,
  updatePasskeyCounter,
} from "@/lib/auth-store";
import { getSession, markReAuth } from "@/lib/session";

/**
 * /api/auth/re-auth — passkey re-auth for sensitive actions
 * (force-override, billing, de-provision, password/passkey changes).
 *
 * Identical ceremony to /api/auth/login, but instead of issuing a new
 * session, it stamps `reAuthAt` on the existing session. The session must
 * already exist (user is signed in); ceremony must complete within 5 min.
 *
 *   GET  — returns options + sets the auth-challenge cookie
 *   POST — verifies + calls markReAuth() to stamp session.reAuthAt
 */

const RP_ID = process.env.WEBAUTHN_RP_ID ?? "localhost";
const ORIGIN = process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3000";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in first" },
      { status: 401 },
    );
  }

  const options = await generateAuthOptions({
    rpID: RP_ID,
    userVerification: "required",
  });

  await setAuthenticationChallenge(options.challenge);

  return NextResponse.json(options);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  const challenge = await getAuthenticationChallenge();
  if (!challenge) {
    return NextResponse.json(
      { error: "Challenge expired" },
      { status: 400 },
    );
  }

  try {
    const body = await req.json();
    if (typeof body?.id !== "string") {
      return NextResponse.json(
        { error: "Malformed assertion" },
        { status: 400 },
      );
    }
    const passkey = await getPasskey(body.id);
    if (!passkey || passkey.userId !== session.userId) {
      return NextResponse.json(
        { error: "Credential does not belong to you" },
        { status: 403 },
      );
    }

    const verification = await verifyAuthResponse({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
      credential: {
        id: passkey.credentialId,
        publicKey: passkey.publicKey as Uint8Array<ArrayBuffer>,
        counter: Number(passkey.counter),
        transports: passkey.transports as never,
      },
    });

    await clearAuthenticationChallenge();

    if (!verification.verified) {
      return NextResponse.json(
        { error: "Verification failed" },
        { status: 400 },
      );
    }

    await updatePasskeyCounter(
      passkey.credentialId,
      BigInt(verification.authenticationInfo.newCounter),
    );

    await markReAuth();
    return NextResponse.json({ verified: true });
  } catch (e) {
    console.error("[auth/re-auth] failed", e);
    return NextResponse.json({ error: "Re-auth error" }, { status: 500 });
  }
}
