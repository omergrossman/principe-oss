// SPDX-License-Identifier: AGPL-3.0-or-later
import { cookies } from "next/headers";
import type { AuthenticatorTransportFuture } from "@principe/rbac";
import { prisma } from "@/lib/db/prisma";

/**
 * Principe passkey auth storage.
 *
 *   - Passkey rows persisted via Prisma (the `Passkey` model)
 *   - Challenges held in a per-browser HttpOnly cookie (see below)
 */

// ─── Challenge store (HttpOnly cookie, short-lived) ──────────────────────
//
// WebAuthn challenges live in an HttpOnly cookie, NOT in process memory. An
// in-memory Map is lost on every server restart and isn't shared across
// instances — so if the process recycled (deploy, crash, scale-out) or the
// TTL lapsed between a ceremony's GET and its verifying POST, the challenge
// vanished. Critically, the authenticator has *already* created the
// credential by then, so a lost challenge orphans it: it lives in the user's
// keychain but is never persisted server-side, and they can never sign in
// with it. A cookie survives restarts and is naturally scoped to the one
// browser running the ceremony, so the POST always finds its challenge.

const CHALLENGE_TTL_SEC = 5 * 60;
const REGISTRATION_CHALLENGE_COOKIE = "principe_reg_challenge";
const AUTHENTICATION_CHALLENGE_COOKIE = "principe_auth_challenge";

// Gate `Secure` on the actual origin scheme, NOT NODE_ENV. The OSS default
// is http://localhost, and a `Secure` cookie is dropped over plain http on a
// non-localhost host (e.g. a LAN-IP self-host) — which would silently strip
// the challenge on the verifying POST. Only mark Secure when served over
// https (set WEBAUTHN_ORIGIN=https://… behind a reverse proxy).
const SECURE_COOKIES = (
  process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3000"
).startsWith("https://");

async function setChallengeCookie(
  name: string,
  challenge: string,
): Promise<void> {
  const store = await cookies();
  store.set(name, challenge, {
    httpOnly: true,
    sameSite: "strict",
    secure: SECURE_COOKIES,
    maxAge: CHALLENGE_TTL_SEC,
    path: "/",
  });
}

async function getChallengeCookie(name: string): Promise<string | null> {
  const store = await cookies();
  return store.get(name)?.value ?? null;
}

async function clearChallengeCookie(name: string): Promise<void> {
  const store = await cookies();
  store.delete(name);
}

export const setRegistrationChallenge = (challenge: string) =>
  setChallengeCookie(REGISTRATION_CHALLENGE_COOKIE, challenge);

export const getRegistrationChallenge = () =>
  getChallengeCookie(REGISTRATION_CHALLENGE_COOKIE);

export const clearRegistrationChallenge = () =>
  clearChallengeCookie(REGISTRATION_CHALLENGE_COOKIE);

export const setAuthenticationChallenge = (challenge: string) =>
  setChallengeCookie(AUTHENTICATION_CHALLENGE_COOKIE, challenge);

export const getAuthenticationChallenge = () =>
  getChallengeCookie(AUTHENTICATION_CHALLENGE_COOKIE);

export const clearAuthenticationChallenge = () =>
  clearChallengeCookie(AUTHENTICATION_CHALLENGE_COOKIE);

// ─── Passkey persistence (Prisma) ────────────────────────────────────────

interface StorePasskeyInput {
  userId: string;
  credentialId: string;
  publicKey: Uint8Array;
  counter: bigint;
  transports?: AuthenticatorTransportFuture[];
  nickname?: string;
}

export async function storePasskey(input: StorePasskeyInput) {
  return prisma.passkey.create({
    data: {
      userId: input.userId,
      credentialId: input.credentialId,
      publicKey: Buffer.from(input.publicKey),
      counter: input.counter,
      transports: input.transports ?? [],
      nickname: input.nickname,
    },
  });
}

export async function getPasskey(credentialId: string) {
  return prisma.passkey.findUnique({ where: { credentialId } });
}

export async function getUserPasskeys(userId: string) {
  return prisma.passkey.findMany({
    where: { userId },
    select: {
      credentialId: true,
      transports: true,
      createdAt: true,
      nickname: true,
    },
  });
}

export async function updatePasskeyCounter(
  credentialId: string,
  newCounter: bigint,
) {
  return prisma.passkey.update({
    where: { credentialId },
    data: { counter: newCounter, lastUsedAt: new Date() },
  });
}

export async function totalPasskeyCount(): Promise<number> {
  return prisma.passkey.count();
}

/**
 * All registered credentials (across users), for the login flow's
 * `allowCredentials`. Listing them means the browser only ever offers
 * credentials the server actually knows — so orphaned keychain entries from
 * abandoned enrolments aren't presented (those fail "credential not found"
 * and confuse the user). Fine for a single-instance self-host; if user counts
 * ever grow large, switch to a true discoverable/usernameless flow.
 */
export async function listAllCredentials(): Promise<
  { credentialId: string; transports: AuthenticatorTransportFuture[] }[]
> {
  const rows = await prisma.passkey.findMany({
    select: { credentialId: true, transports: true },
  });
  return rows.map((r) => ({
    credentialId: r.credentialId,
    transports: r.transports as AuthenticatorTransportFuture[],
  }));
}
