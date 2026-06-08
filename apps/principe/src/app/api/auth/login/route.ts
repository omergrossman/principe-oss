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
  totalPasskeyCount,
} from "@/lib/auth-store";
import { createSession, getSession } from "@/lib/session";
import { prisma } from "@/lib/db/prisma";

/**
 * /api/auth/login — passkey assertion.
 *
 *   GET  — returns WebAuthn options with discoverable credential flow.
 *          When no passkeys exist anywhere yet, returns 404 so /login
 *          can show a "create your account first" hint.
 *   POST — verifies the assertion, increments the signature counter, and
 *          issues a session bound to the credential's owner + their most
 *          recent membership.
 *
 * Challenge tracked across GET → POST via a short-lived HTTP-only cookie
 * (the user identifies via credentialId, not by their cookied user id).
 */

const RP_ID = process.env.WEBAUTHN_RP_ID ?? "localhost";
const ORIGIN = process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3001";
const CEREMONY_COOKIE = "principe_passkey_ceremony";
const CEREMONY_TTL_SEC = 5 * 60;

function newCeremonyId(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Buffer.from(buf).toString("base64url");
}

export async function GET() {
  const passkeyCount = await totalPasskeyCount();
  if (passkeyCount === 0) {
    return NextResponse.json(
      { error: "No credentials registered" },
      { status: 404 },
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
  const store = await cookies();
  const ceremonyId = store.get(CEREMONY_COOKIE)?.value;
  if (!ceremonyId) {
    return NextResponse.json(
      { error: "No challenge cookie — call GET /api/auth/login first" },
      { status: 400 },
    );
  }
  const challenge = getAuthenticationChallenge(ceremonyId);
  if (!challenge) {
    return NextResponse.json(
      { error: "Challenge expired — try signing in again" },
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
    if (!passkey) {
      return NextResponse.json(
        { error: "Credential not found" },
        { status: 404 },
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

    // Resolve user + active membership.
    const dbUser = await prisma.user.findUnique({
      where: { id: passkey.userId },
      include: { memberships: { orderBy: { createdAt: "desc" } } },
    });
    if (!dbUser) {
      return NextResponse.json(
        { error: "User account no longer exists" },
        { status: 410 },
      );
    }
    if (dbUser.memberships.length === 0) {
      return NextResponse.json(
        {
          error: "No workspace found",
          redirect: "/signup",
        },
        { status: 409 },
      );
    }

    // Prefer the prior active membership if still valid; else most-recent.
    const prior = await getSession();
    const priorMembership =
      prior?.userId === dbUser.id
        ? dbUser.memberships.find((m) => m.id === prior.membershipId)
        : undefined;
    const activeMembership = priorMembership ?? dbUser.memberships[0];

    await prisma.user.update({
      where: { id: dbUser.id },
      data: { lastSignInAt: new Date() },
    });

    await createSession({
      userId: dbUser.id,
      membershipId: activeMembership.id,
      firmId: activeMembership.firmId ?? "",
      portcoId: activeMembership.portcoId,
      role: activeMembership.role,
    });

    return NextResponse.json({ verified: true });
  } catch (e) {
    console.error("[auth/login] failed", e);
    return NextResponse.json(
      { error: "Authentication error" },
      { status: 500 },
    );
  }
}
