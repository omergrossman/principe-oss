// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * Scope: a single self-hosted instance (one web process). It is intentionally
 * NOT distributed — counters live in process memory and reset on restart. For
 * a single-container OSS deployment that's sufficient to stop an authenticated
 * user from running unbounded paid LLM fan-outs back-to-back. If Principe ever
 * runs multi-replica, swap this for a shared store (Redis/DB).
 */

const hits = new Map<string, number[]>();

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the next request would be allowed (when !ok). */
  retryAfterSec: number;
}

/**
 * Record a hit for `key` and report whether it's within `limit` per
 * `windowMs`. Call once per guarded request.
 */
export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - opts.windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);

  if (recent.length >= opts.limit) {
    hits.set(key, recent);
    const retryAfterSec = Math.max(
      1,
      Math.ceil((recent[0] + opts.windowMs - now) / 1000),
    );
    return { ok: false, retryAfterSec };
  }

  recent.push(now);
  hits.set(key, recent);
  return { ok: true, retryAfterSec: 0 };
}
