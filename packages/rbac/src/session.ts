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
 * Wire format (v0): base64(JSON.stringify(payload)). Plain (un-signed) for
 * now — Fable historically used the same shape and we keep wire compatibility
 * so existing cookies survive the extraction. A signed variant can be added
 * later behind a different helper without breaking this one.
 *
 * The payload is a generic — consumers describe their own session shape
 * (e.g. `{ userId, currentOrgId, createdAt }` for Fable) and pass it in.
 * The only field this module looks at is `createdAt`, which it uses for the
 * max-age check.
 */

export interface BaseSessionPayload {
  /** Wall-clock milliseconds at which the session was issued. */
  createdAt: number
}

/** Default cookie name. Consumers may (and Fable does) override per project. */
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
export function encodeSession<T extends BaseSessionPayload>(payload: T): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64')
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
    maxAgeSec?: number
    /** Allow injecting a deterministic clock for tests. */
    now?: () => number
  },
): T | null {
  if (!raw) return null
  const maxAgeSec = opts.maxAgeSec ?? DEFAULT_SESSION_MAX_AGE_SEC
  const now = opts.now ?? Date.now

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64').toString())
  } catch {
    return null
  }

  if (!opts.validate(parsed)) return null

  const ageSec = (now() - parsed.createdAt) / 1000
  if (ageSec > maxAgeSec) return null

  return parsed
}
