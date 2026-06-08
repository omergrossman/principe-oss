// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateAuthOptions, verifyAuthResponse } from "@dp/rbac";
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
 *   GET  — returns options + sets ceremony cookie
 *   POST — verifies + calls markReAuth() to stamp session.reAuthAt
 */

const RP_ID = process.env.WEBAUTHN_RP_ID ?? "localhost";
const ORIGIN = process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3001";
const CEREMONY_COOKIE = "principe_re_auth_ceremony";
const CEREMONY_TTL_SEC = 5 * 60;

function newCeremonyId(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Buffer.from(buf).toString("base64url");
}

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
    userVerification: "preferred",
  });

  const ceremonyId = newCeremonyId();
  setAuthenticationChallenge(ceremonyId, options.challenge);

  const store = await cookies();
  store.set(CEREMONY_COOKIE, ceremonyId, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: CEREMONY_TTL_SEC,
    path: "/",
  });

  return NextResponse.json(options);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  const store = await cookies();
  const ceremonyId = store.get(CEREMONY_COOKIE)?.value;
  if (!ceremonyId) {
    return NextResponse.json(
      { error: "No challenge cookie — call GET first" },
      { status: 400 },
    );
  }
  const challenge = getAuthenticationChallenge(ceremonyId);
  if (!challenge) {
    return NextResponse.json(
      { error: "Challenge expired" },
      { status: 400 },
    );
  }

  try {
    const body = await req.json();
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
      credential: {
        id: passkey.credentialId,
        publicKey: passkey.publicKey as Uint8Array<ArrayBuffer>,
        counter: Number(passkey.counter),
        transports: passkey.transports as never,
      },
    });

    clearAuthenticationChallenge(ceremonyId);
    store.delete(CEREMONY_COOKIE);

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
