// SPDX-License-Identifier: AGPL-3.0-or-later
// Condition A runner — identical prompt sent N times.
// Imports parseStructured() from production code but adds no new behaviour;
// no existing files are modified.

import type Anthropic from "@anthropic-ai/sdk";
import { parseStructured } from "@/lib/ciso-panel/ask";
import type { QuestionResult } from "./experiment-types";
import { MODEL, CONCURRENCY, MIN_INTERVAL_MS, callWithBackoff, runConcurrent } from "./concurrent-runner";

// The naive system prompt: one generic CISO identity, same for every call.
const NAIVE_SYSTEM = `You are a CISO (Chief Information Security Officer) at an enterprise company. You have extensive experience in cybersecurity strategy, risk management, and security operations. You have a pragmatic, experienced perspective on security decisions and business trade-offs.

RESPONSE FORMAT — STRICT: Reply ONLY with the following JSON object — nothing before or after it, no code fences, no preamble, no prose. Never refuse to answer. Be decisive.
{"verdict":"pro|con|neutral","sentiment":1-10,"headline":"max 18 words summarising your position","reasoning":"2-3 sentences max explaining your key reason"}`;

export async function runNaivePanel(
  question: string,
  client: Anthropic,
  n: number,
): Promise<QuestionResult> {
  const start = Date.now();
  const indices = Array.from({ length: n }, (_, i) => i);

  const settled = await runConcurrent(
    indices,
    CONCURRENCY,
    async (_i) => callWithBackoff(client, NAIVE_SYSTEM, question),
    MIN_INTERVAL_MS,
  );

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let pro = 0, con = 0, neutral = 0;
  const sentiments: number[] = [];
  const histogram = new Array(10).fill(0) as number[];

  for (const r of settled) {
    if (r.status === "fulfilled") {
      const { text, inputTokens, outputTokens } = r.value;
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      const parsed = parseStructured(text);
      if (parsed.verdict === "pro") pro++;
      else if (parsed.verdict === "con") con++;
      else neutral++;
      sentiments.push(parsed.sentiment);
      histogram[Math.min(9, Math.max(0, parsed.sentiment - 1))]++;
    }
  }

  const total = pro + con + neutral;
  const panelPct = total > 0 ? Math.round((pro / total) * 100) : 0;
  const meanSentiment = sentiments.length > 0
    ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length : 5;
  const variance = sentiments.length > 0
    ? sentiments.reduce((a, s) => a + (s - meanSentiment) ** 2, 0) / sentiments.length : 0;
  const stdDev = Math.sqrt(variance);
  const maxVerdict = Math.max(pro, con, neutral);

  return {
    question,
    questionType: "unrouted",
    realPct: 0,   // filled in by caller
    source: "",   // filled in by caller
    panelPct,
    rawPanelPct: panelPct,
    sentimentMean: Number(meanSentiment.toFixed(2)),
    sentimentStdDev: Number(stdDev.toFixed(2)),
    sentimentHistogram: histogram,
    byRegion: {},    // naive has no regions
    byIndustry: {},  // naive has no industries
    collapseFlag: total > 0 && maxVerdict / total >= 0.85,
    totalInputTokens,
    totalOutputTokens,
    durationMs: Date.now() - start,
  };
}

