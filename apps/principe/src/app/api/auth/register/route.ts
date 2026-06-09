// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from "next/server";
import {
  generateRegOptions,
  verifyRegResponse,
  type AuthenticatorTransportFuture,
} from "@principe/rbac";
import {
  setRegistrationChallenge,
  getRegistrationChallenge,
  clearRegistrationChallenge,
  storePasskey,
  getUserPasskeys,
} from "@/lib/auth-store";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db/prisma";

/**
 * /api/auth/register — passkey enrollment for the currently-signed-in user.
 *
 *   GET  — returns PublicKeyCredentialCreationOptions
 *   POST — verifies the attestation and writes the credential to the DB
 *
 * Requires an active session (created by /api/auth/signup or
 * /api/auth/accept-invite).
 */

const RP_NAME = process.env.WEBAUTHN_RP_NAME ?? "Príncipe";
const RP_ID = process.env.WEBAUTHN_RP_ID ?? "localhost";
const ORIGIN = process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3000";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in or sign up before enrolling a passkey" },
      { status: 401 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const existing = await getUserPasskeys(user.id);

  const options = await generateRegOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(user.id),
    userName: user.email,
    userDisplayName: user.name ?? user.email,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  await setRegistrationChallenge(options.challenge);
  return NextResponse.json(options);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in or sign up before enrolling a passkey" },
      { status: 401 },
    );
  }

  const challenge = await getRegistrationChallenge();
  if (!challenge) {
    return NextResponse.json(
      { error: "Challenge expired — call GET /api/auth/register again" },
      { status: 400 },
    );
  }

  try {
    const body = await req.json();
    const verification = await verifyRegResponse({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });

    await clearRegistrationChallenge();

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json(
        { error: "Verification failed" },
        { status: 400 },
      );
    }

    const { credential } = verification.registrationInfo;
    const transports = (body?.response?.transports ?? []) as
      | AuthenticatorTransportFuture[]
      | undefined;

    await storePasskey({
      userId: session.userId,
      credentialId: credential.id,
      publicKey: credential.publicKey,
      counter: BigInt(credential.counter),
      transports,
    });

    return NextResponse.json({ verified: true });
  } catch (e) {
    console.error("[auth/register] failed", e);
    return NextResponse.json(
      { error: "Registration error" },
      { status: 500 },
    );
  }
}
