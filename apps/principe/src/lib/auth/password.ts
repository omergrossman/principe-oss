// SPDX-License-Identifier: AGPL-3.0-or-later
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing for Principe's single-tenant self-host auth.
 *
 * scrypt (Node built-in, no native dep) with a per-hash random salt. Stored
 * as `scrypt$<saltHex>$<hashHex>`. Verification is constant-time.
 *
 * scrypt params: N=2^15 (default), 64-byte derived key. Plenty for a
 * self-hosted box; tune up if you ever expose this beyond localhost.
 */

const scrypt = promisify(_scrypt);
const KEYLEN = 64;
const SALT_BYTES = 16;

export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scrypt(password, salt, KEYLEN)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const derived = (await scrypt(password, salt, expected.length)) as Buffer;
  // Both buffers are the same length here (expected.length), so
  // timingSafeEqual won't throw.
  return timingSafeEqual(derived, expected);
}
