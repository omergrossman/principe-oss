// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Session encode/decode helpers — pure functions, no IO.
 *
 * These produce / consume the *cookie value string* the consumer will write
 * to whatever cookie store its host framework gives it (Next's `cookies()`,
 * Express's `res.cookie`, etc.). The package deliberately doesn't touch
 * `next/headers` or any framework primitives — that keeps it usable from
 * route handlers, middleware, scripts, and tests alike.
 *
 * Wire format (v1): `<payload>.<sig>` where `payload` is
 * base64url(JSON.stringify(payload)) and `sig` is a base64url
 * HMAC-SHA256 of `payload` keyed by a caller-supplied server secret.
 * decodeSession verifies the HMAC (timing-safe) BEFORE parsing, so a
 * client cannot forge or tamper with their session (e.g. escalate role or
 * switch tenant) — the cookie being `httpOnly` only stops theft, not
 * fabrication, which is why the signature is mandatory.
 *
 * The payload is a generic — consumers describe their own session shape
 * and pass it in. The only field this module looks at is `createdAt`,
 * which it uses for the max-age check.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export interface BaseSessionPayload {
  /** Wall-clock milliseconds at which the session was issued. */
  createdAt: number
}

/** HMAC-SHA256 of the payload segment, base64url-encoded. */
function sign(payloadB64: string, secret: string | Buffer): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

/** Default cookie name. Consumers may (as consuming apps do) override per project. */
export const DEFAULT_SESSION_COOKIE_NAME = 'dp_session'

/** Default cookie max-age in seconds (8 hours). */
export const DEFAULT_SESSION_MAX_AGE_SEC = 60 * 60 * 8

/**
 * Encode a session payload to a cookie value string.
 *
 * Pure — no IO, no framework. Caller is responsible for writing the result
 * to the actual cookie store (with the desired cookie attributes:
 * `httpOnly`, `sameSite`, `maxAge`, `path`).
 */
export function encodeSession<T extends BaseSessionPayload>(
  payload: T,
  secret: string | Buffer,
): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${payloadB64}.${sign(payloadB64, secret)}`
}

/**
 * Decode a cookie value back to a session payload.
 *
 * Returns `null` if:
 *   - the value is missing / unparseable
 *   - the decoded payload fails the `validate` predicate
 *   - the payload is older than `maxAgeSec`
 *
 * Callers should pass a `validate` that asserts every required field; this
 * way a stale pre-migration cookie (with the wrong shape) is rejected here
 * rather than leaking partial state up the stack.
 */
export function decodeSession<T extends BaseSessionPayload>(
  raw: string | null | undefined,
  opts: {
    validate: (value: unknown) => value is T
    /** Server secret the cookie was signed with. Required. */
    secret: string | Buffer
    maxAgeSec?: number
    /** Allow injecting a deterministic clock for tests. */
    now?: () => number
  },
): T | null {
  if (!raw) return null
  const maxAgeSec = opts.maxAgeSec ?? DEFAULT_SESSION_MAX_AGE_SEC
  const now = opts.now ?? Date.now

  // Split `<payload>.<sig>`. A legacy unsigned cookie (no `.`) or a tampered
  // one fails here and is rejected before we ever parse attacker-controlled
  // JSON.
  const dot = raw.lastIndexOf('.')
  if (dot <= 0 || dot === raw.length - 1) return null
  const payloadB64 = raw.slice(0, dot)
  const providedSig = raw.slice(dot + 1)

  const expectedSig = sign(payloadB64, opts.secret)
  const a = Buffer.from(providedSig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
  } catch {
    return null
  }

  if (!opts.validate(parsed)) return null

  const ageSec = (now() - parsed.createdAt) / 1000
  if (ageSec > maxAgeSec) return null

  return parsed
}
