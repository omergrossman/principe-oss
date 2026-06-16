// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared concurrency utilities for the experiment harness runners.
// No existing files are modified.

import type Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-haiku-4-5";
export const CONCURRENCY = 4;
export const MIN_INTERVAL_MS = 1500;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

export async function callWithBackoff(
  client: Anthropic,
  system: string,
  question: string,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 700,
        system,
        messages: [
          { role: "user", content: question },
          { role: "assistant", content: "{" },
        ],
      });
      const continuation = res.content
        .map((c) => (c.type === "text" ? c.text : ""))
        .join("");
      return {
        text: `{${continuation}`.trim(),
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      };
    } catch (e) {
      lastErr = e;
      const status =
        typeof (e as { status?: number })?.status === "number"
          ? (e as { status: number }).status
          : 0;
      if (status !== 429 || attempt === MAX_RETRIES) throw e;
      const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.floor(Math.random() * 1000);
      await new Promise<void>((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export async function runConcurrent<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
  minIntervalMs = 0,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  let nextAt = Date.now();

  async function pump() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      if (minIntervalMs > 0) {
        const now = Date.now();
        const wait = Math.max(0, nextAt - now);
        nextAt = Math.max(now, nextAt) + minIntervalMs;
        if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
      }
      try {
        results[i] = { status: "fulfilled", value: await worker(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, pump));
  for (let i = 0; i < items.length; i++) {
    if (!results[i]) results[i] = { status: "rejected", reason: new Error("cancelled") };
  }
  return results;
}

export function toProPct(
  counts: Record<string, { pro: number; con: number; neutral: number }>,
): Record<string, { proPct: number; n: number }> {
  const out: Record<string, { proPct: number; n: number }> = {};
  for (const [key, c] of Object.entries(counts)) {
    const n = c.pro + c.con + c.neutral;
    out[key] = { proPct: n > 0 ? Math.round((c.pro / n) * 100) : 0, n };
  }
  return out;
}
