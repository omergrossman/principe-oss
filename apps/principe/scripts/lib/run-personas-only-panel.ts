// SPDX-License-Identifier: AGPL-3.0-or-later
// Condition B runner — 100 distinct personas, base system prompt only.
// No question router, no type skill, no persona depth section, no ask history,
// no briefing, no calibration. Isolates the contribution of persona diversity
// alone, with none of the enrichment layers Principe adds on top.
// No existing files are modified.

import type Anthropic from "@anthropic-ai/sdk";
import { parseStructured } from "@/lib/ciso-panel/ask";
import { generateAgentsForProject } from "@/lib/projects/materialise";
import type { QuestionResult } from "./experiment-types";
import { CONCURRENCY, MIN_INTERVAL_MS, callWithBackoff, runConcurrent, toProPct } from "./concurrent-runner";

// Same format suffix as production's askOne() — the ONLY purpose is to ensure
// the model returns JSON. This is NOT the type-specific skill (which is what
// distinguishes B from C, among other things).
const FORMAT_SUFFIX = `\n\nRESPONSE FORMAT — STRICT: Reply AS this persona with ONLY the single JSON object you were instructed to produce (verdict, sentiment, headline, reasoning) — nothing before or after it, no code fences, no preamble, no plain prose. Even if the question is open-ended, vague, a direct query, or not a product pitch, still answer in character with a real verdict and reasoning — NEVER refuse, never reply that you only evaluate pitches, never break format. Keep "reasoning" to 2-3 short sentences (~50 words maximum); be decisive, not exhaustive.`;

export async function runPersonasOnlyPanel(
  question: string,
  client: Anthropic,
  n: number,
): Promise<QuestionResult> {
  const start = Date.now();
  // generateAgentsForProject is pure (no DB). When composition is null, it uses
  // the canonical Sprint-1 seed — the same 100 personas as any default project.
  const personas = generateAgentsForProject("experiment-b-canonical", null, n);

  interface PersonaCall {
    systemPrompt: string;
    region: string;
    industry: string;
    stance: string;
  }
  const calls: PersonaCall[] = personas.map((p) => ({
    systemPrompt: p.systemPrompt + FORMAT_SUFFIX,
    region: p.region,
    industry: p.industry,
    stance: p.stance,
  }));

  const settled = await runConcurrent(
    calls,
    CONCURRENCY,
    async (c) => {
      const raw = await callWithBackoff(client, c.systemPrompt, question);
      return { ...raw, region: c.region, industry: c.industry };
    },
    MIN_INTERVAL_MS,
  );

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let pro = 0, con = 0, neutral = 0;
  const sentiments: number[] = [];
  const histogram = new Array(10).fill(0) as number[];
  const regionCounts: Record<string, { pro: number; con: number; neutral: number }> = {};
  const industryCounts: Record<string, { pro: number; con: number; neutral: number }> = {};

  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    const { text, inputTokens, outputTokens, region, industry } = r.value;
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    const parsed = parseStructured(text);
    if (parsed.verdict === "pro") pro++;
    else if (parsed.verdict === "con") con++;
    else neutral++;
    sentiments.push(parsed.sentiment);
    histogram[Math.min(9, Math.max(0, parsed.sentiment - 1))]++;

    if (!regionCounts[region]) regionCounts[region] = { pro: 0, con: 0, neutral: 0 };
    regionCounts[region][parsed.verdict]++;
    if (!industryCounts[industry]) industryCounts[industry] = { pro: 0, con: 0, neutral: 0 };
    industryCounts[industry][parsed.verdict]++;
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
    realPct: 0,
    source: "",
    panelPct,
    rawPanelPct: panelPct,
    sentimentMean: Number(meanSentiment.toFixed(2)),
    sentimentStdDev: Number(stdDev.toFixed(2)),
    sentimentHistogram: histogram,
    byRegion: toProPct(regionCounts),
    byIndustry: toProPct(industryCounts),
    collapseFlag: total > 0 && maxVerdict / total >= 0.85,
    totalInputTokens,
    totalOutputTokens,
    durationMs: Date.now() - start,
  };
}

