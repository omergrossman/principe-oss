// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AuthenticatorTransportFuture } from "@dp/rbac";
import { prisma } from "@/lib/db/prisma";

/**
 * Principe passkey auth storage.
 *
 * Lifted from Fable's pattern:
 *   - Passkey rows persisted via Prisma (the `Passkey` model)
 *   - Challenges kept in-memory (5-minute TTL; ephemeral by design)
 *   - Registration challenges keyed by userId (we know who they are)
 *   - Authentication challenges keyed by a synthetic ceremony id (the user
 *     identifies via the credentialId returned by the authenticator)
 */

// ─── Challenge store (in-memory, short-lived) ────────────────────────────

interface ChallengeRecord {
  challenge: string;
  expiresAt: number;
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const registrationChallenges = new Map<string, ChallengeRecord>();
const authenticationChallenges = new Map<string, ChallengeRecord>();

function setChallenge(
  store: Map<string, ChallengeRecord>,
  key: string,
  challenge: string,
): void {
  store.set(key, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}

function getChallenge(
  store: Map<string, ChallengeRecord>,
  key: string,
): string | null {
  const record = store.get(key);
  if (!record) return null;
  if (record.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  return record.challenge;
}

function clearChallenge(
  store: Map<string, ChallengeRecord>,
  key: string,
): void {
  store.delete(key);
}

export const setRegistrationChallenge = (userId: string, challenge: string) =>
  setChallenge(registrationChallenges, userId, challenge);

export const getRegistrationChallenge = (userId: string) =>
  getChallenge(registrationChallenges, userId);

export const clearRegistrationChallenge = (userId: string) =>
  clearChallenge(registrationChallenges, userId);

export const setAuthenticationChallenge = (
  ceremonyId: string,
  challenge: string,
) => setChallenge(authenticationChallenges, ceremonyId, challenge);

export const getAuthenticationChallenge = (ceremonyId: string) =>
  getChallenge(authenticationChallenges, ceremonyId);

export const clearAuthenticationChallenge = (ceremonyId: string) =>
  clearChallenge(authenticationChallenges, ceremonyId);

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
