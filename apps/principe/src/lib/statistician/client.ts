// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHmac } from "node:crypto";

import type { VerdictRequest, VerdictResponse } from "./types";

// Per Story 04.1 AC. Five attempts with a 60s gap means up to ~5 minutes of
// blocking wait before we surface "service unavailable" to the founder. This
// is intentional: a silent PASS on a degraded Statistician would let through
// statistically invalid cycles, which the V1 brief explicitly forbids.
const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 60_000;
const MAX_BODY_BYTES = 256 * 1024;

export class StatisticianUnavailable extends Error {
  readonly kind = "StatisticianUnavailable" as const;
  constructor(message: string, readonly attempts: number) {
    super(message);
    this.name = "StatisticianUnavailable";
  }
}

export class PayloadTooLargeError extends Error {
  readonly kind = "PayloadTooLargeError" as const;
  constructor(bytes: number) {
    super(`Request body ${bytes} bytes exceeds ${MAX_BODY_BYTES} byte cap`);
    this.name = "PayloadTooLargeError";
  }
}

export class StatisticianContractViolation extends Error {
  readonly kind = "StatisticianContractViolation" as const;
  constructor(message: string) {
    super(message);
    this.name = "StatisticianContractViolation";
  }
}

export class StatisticianBadRequest extends Error {
  readonly kind = "StatisticianBadRequest" as const;
  constructor(message: string, readonly detail: unknown) {
    super(message);
    this.name = "StatisticianBadRequest";
  }
}

/**
 * A short, user-facing sentence explaining why statistical-soundness checks
 * are missing. Validation never blocks a panel result, so these reassure the
 * user the verdicts are fine while hiding stack/network noise (ECONNREFUSED…).
 */
export function describeStatisticianError(e: unknown): string {
  const tail = " The panel verdicts are unaffected.";
  if (e instanceof StatisticianUnavailable) {
    return "The Statistician service isn't responding, so statistical-soundness checks were skipped." + tail;
  }
  if (e instanceof StatisticianContractViolation) {
    return "The Statistician rejected the request (a configuration mismatch), so checks were skipped." + tail;
  }
  if (e instanceof PayloadTooLargeError || e instanceof StatisticianBadRequest) {
    return "The Statistician couldn't process this panel's data, so checks were skipped." + tail;
  }
  return e instanceof Error ? e.message.slice(0, 160) : String(e);
}

interface ClientConfig {
  url: string;
  secret: string;
  fetchImpl?: typeof fetch;
  sleepMs?: (ms: number) => Promise<void>;
}

function getConfig(overrides?: Partial<ClientConfig>): ClientConfig {
  const url = overrides?.url ?? process.env.STATISTICIAN_SERVICE_URL ?? "";
  const secret = overrides?.secret ?? process.env.STATISTICIAN_SHARED_SECRET ?? "";
  if (!url) throw new Error("STATISTICIAN_SERVICE_URL is not set");
  if (!secret) throw new Error("STATISTICIAN_SHARED_SECRET is not set");
  return {
    url: url.replace(/\/$/, ""),
    secret,
    fetchImpl: overrides?.fetchImpl ?? fetch,
    sleepMs: overrides?.sleepMs ?? defaultSleep,
  };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function sign(secret: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

function isRetriable(status: number): boolean {
  // Retry network errors and 5xx; never retry 4xx (caller's fault).
  return status >= 500 && status < 600;
}

export async function requestVerdict(
  payload: VerdictRequest,
  overrides?: Partial<ClientConfig>,
): Promise<VerdictResponse> {
  const cfg = getConfig(overrides);
  const body = JSON.stringify(payload);
  const bytes = Buffer.byteLength(body, "utf8");
  if (bytes > MAX_BODY_BYTES) throw new PayloadTooLargeError(bytes);

  const signature = sign(cfg.secret, body);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-principe-signature": signature,
  };

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await cfg.fetchImpl!(`${cfg.url}/verdict`, {
        method: "POST",
        headers,
        body,
      });
    } catch (e) {
      lastError = e;
      if (attempt < MAX_ATTEMPTS) await cfg.sleepMs!(RETRY_DELAY_MS);
      continue;
    }

    if (res.status === 413) throw new PayloadTooLargeError(bytes);
    if (res.status === 401) {
      throw new StatisticianContractViolation("401 from Statistician — shared secret mismatch");
    }
    if (res.status === 400) {
      const detail = await res.json().catch(() => ({}));
      throw new StatisticianBadRequest("400 from Statistician", detail);
    }
    if (isRetriable(res.status)) {
      lastError = new Error(`HTTP ${res.status}`);
      if (attempt < MAX_ATTEMPTS) await cfg.sleepMs!(RETRY_DELAY_MS);
      continue;
    }
    if (!res.ok) {
      throw new StatisticianContractViolation(`Unexpected status ${res.status}`);
    }

    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch (e) {
      throw new StatisticianContractViolation(
        `Failed to parse Statistician response as JSON: ${(e as Error).message}`,
      );
    }
    if (!isVerdictResponse(parsed)) {
      throw new StatisticianContractViolation(
        "Statistician response does not match the V1 contract",
      );
    }
    return parsed;
  }

  throw new StatisticianUnavailable(
    `Statistician unreachable after ${MAX_ATTEMPTS} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
    MAX_ATTEMPTS,
  );
}

function isVerdictResponse(x: unknown): x is VerdictResponse {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    (o.verdict === "PASS" || o.verdict === "WARN" || o.verdict === "FAIL") &&
    typeof o.credibleInterval === "object" &&
    o.credibleInterval !== null &&
    typeof (o.credibleInterval as Record<string, unknown>).low === "number" &&
    typeof (o.credibleInterval as Record<string, unknown>).high === "number" &&
    typeof o.klDivergence === "number" &&
    Array.isArray(o.perStratumRepresentation) &&
    typeof o.recommendedN === "number" &&
    typeof o.reasoningTrace === "string" &&
    typeof o.stub === "boolean"
  );
}

export async function healthz(
  overrides?: Partial<Pick<ClientConfig, "url" | "fetchImpl">>,
): Promise<{ ok: boolean; version: string }> {
  const url = overrides?.url ?? process.env.STATISTICIAN_SERVICE_URL ?? "";
  if (!url) throw new Error("STATISTICIAN_SERVICE_URL is not set");
  const f = overrides?.fetchImpl ?? fetch;
  const res = await f(`${url.replace(/\/$/, "")}/healthz`);
  if (!res.ok) throw new StatisticianContractViolation(`healthz HTTP ${res.status}`);
  const body = (await res.json()) as { ok?: unknown; version?: unknown };
  if (typeof body.ok !== "boolean" || typeof body.version !== "string") {
    throw new StatisticianContractViolation("healthz body does not match contract");
  }
  return { ok: body.ok, version: body.version };
}
