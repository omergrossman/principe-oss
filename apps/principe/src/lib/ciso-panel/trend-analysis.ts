// SPDX-License-Identifier: AGPL-3.0-or-later
import type Anthropic from "@anthropic-ai/sdk";
import type { PanelAggregates } from "./ask";
import { calibrate } from "./calibration-map";
import type { QuestionType } from "./question-router";
import { ANTHROPIC_MODELS } from "@/lib/anthropic/models";

export type TrendContext = {
  marketSaturation: "low" | "moderate" | "high";
  vcMomentum: "accelerating" | "stable" | "cooling";
  timingSignal: "early" | "peak" | "late";
  viabilityScore: number;
  narrative: string;
  dataSource: "corpus-only" | "corpus+updates";
  matchedCategories: string[];
};

export type RawTrendSignals = {
  marketSaturation: "low" | "moderate" | "high";
  vcMomentum: "accelerating" | "stable" | "cooling";
  timingSignal: "early" | "peak" | "late";
  trendAlignmentScore: number;
  vcMomentumScore: number;
  narrative: string;
};

type ScoreInputs = {
  panelAgreementRate: number;
  trendAlignment: number;
  vcMomentumScore: number;
};

export function computeViabilityScore(inputs: ScoreInputs): number {
  const raw =
    inputs.panelAgreementRate * 0.4 +
    inputs.trendAlignment * 0.35 +
    inputs.vcMomentumScore * 0.25;
  return Math.round(Math.min(100, Math.max(0, raw * 100)));
}

export function buildTrendContext(
  signals: RawTrendSignals,
  panelAgreementRate: number,
  matchedCategories: string[],
  dataSource: "corpus-only" | "corpus+updates",
): TrendContext {
  return {
    marketSaturation: signals.marketSaturation,
    vcMomentum: signals.vcMomentum,
    timingSignal: signals.timingSignal,
    viabilityScore: computeViabilityScore({
      panelAgreementRate,
      trendAlignment: signals.trendAlignmentScore,
      vcMomentumScore: signals.vcMomentumScore,
    }),
    narrative: signals.narrative,
    dataSource,
    matchedCategories,
  };
}

export function shouldTemperSynthesis(ctx: TrendContext): boolean {
  return (
    ctx.viabilityScore < 60 ||
    ctx.marketSaturation === "high" ||
    ctx.vcMomentum === "cooling"
  );
}

const TREND_SYSTEM = `You are a market analyst specialising in cybersecurity venture markets.

Given a founder's question and calibration data, assess the market dynamics.

Output EXACTLY this JSON shape, no prose:
{
  "marketSaturation": "low" | "moderate" | "high",
  "vcMomentum": "accelerating" | "stable" | "cooling",
  "timingSignal": "early" | "peak" | "late",
  "trendAlignmentScore": <0.0–1.0, how well the idea aligns with current spend trends>,
  "vcMomentumScore": <0.0–1.0, 1 = active deal flow, 0 = dried up>,
  "narrative": "<1-2 sentences: the single most important market signal a founder should know>"
}`;

type KnowledgeSnippet = { title: string; content: string | null };

export function buildAnalyzeTrendsPrompt(
  question: string,
  aggregates: PanelAggregates,
  categories: string[],
  knowledgeSources: KnowledgeSnippet[],
): string {
  const lines = [
    `QUESTION: ${question}`,
    `PANEL AGREEMENT RATE: ${aggregates.proPct}% pro, ${aggregates.conPct}% con, ${aggregates.neutralPct}% neutral`,
    `MATCHED CALIBRATION CATEGORIES: ${categories.join(", ") || "none"}`,
  ];

  if (knowledgeSources.length > 0) {
    const snippets = knowledgeSources
      .map((s) => `[${s.title}]\n${(s.content ?? "").slice(0, 400)}`)
      .join("\n\n");
    lines.push(`\nMARKET KNOWLEDGE SOURCES:\n${snippets}`);
  }

  return lines.join("\n");
}

export async function analyzeTrends(
  question: string,
  aggregates: PanelAggregates,
  questionType: QuestionType | undefined,
  client: Anthropic,
  knowledgeSources: KnowledgeSnippet[] = [],
): Promise<TrendContext | null> {
  try {
    const cal = calibrate(questionType ?? "PITCH", aggregates.proCount);
    const matchedCategories = cal.categories;
    const hasLiveFeed =
      !!process.env.PRINCIPE_UPDATES_URL &&
      process.env.PRINCIPE_UPDATES_URL !== "disabled";
    const dataSource: TrendContext["dataSource"] = hasLiveFeed
      ? "corpus+updates"
      : "corpus-only";

    const panelAgreementRate = aggregates.proPct / 100;

    const userPayload = buildAnalyzeTrendsPrompt(
      question,
      aggregates,
      matchedCategories,
      knowledgeSources,
    );

    const res = await client.messages.create({
      model: ANTHROPIC_MODELS.trend,
      max_tokens: 512,
      system: TREND_SYSTEM,
      messages: [{ role: "user", content: userPayload }],
    });

    const text = res.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("")
      .trim();

    const signals = parseAnalyzeTrendsResponse(text);
    if (!signals) return null;

    return buildTrendContext(signals, panelAgreementRate, matchedCategories, dataSource);
  } catch {
    return null;
  }
}

const SATURATION_VALUES = new Set<string>(["low", "moderate", "high"]);
const MOMENTUM_VALUES = new Set<string>(["accelerating", "stable", "cooling"]);
const TIMING_VALUES = new Set<string>(["early", "peak", "late"]);

export function parseAnalyzeTrendsResponse(text: string): RawTrendSignals | null {
  if (!text.trim()) return null;
  try {
    let cleaned = text.trim();
    const fence = cleaned.match(/^```[a-z]*\n?([\s\S]*?)\n?```$/i);
    if (fence) cleaned = fence[1].trim();
    if (!cleaned.startsWith("{")) {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (!m) return null;
      cleaned = m[0];
    }
    const p = JSON.parse(cleaned) as Record<string, unknown>;
    const sat = p.marketSaturation;
    const mom = p.vcMomentum;
    const tim = p.timingSignal;
    const align = p.trendAlignmentScore;
    const vcScore = p.vcMomentumScore;
    const narrative = p.narrative;
    if (
      typeof sat !== "string" || !SATURATION_VALUES.has(sat) ||
      typeof mom !== "string" || !MOMENTUM_VALUES.has(mom) ||
      typeof tim !== "string" || !TIMING_VALUES.has(tim) ||
      typeof align !== "number" || align < 0 || align > 1 ||
      typeof vcScore !== "number" || vcScore < 0 || vcScore > 1 ||
      typeof narrative !== "string"
    ) return null;
    return {
      marketSaturation: sat as RawTrendSignals["marketSaturation"],
      vcMomentum: mom as RawTrendSignals["vcMomentum"],
      timingSignal: tim as RawTrendSignals["timingSignal"],
      trendAlignmentScore: align,
      vcMomentumScore: vcScore,
      narrative,
    };
  } catch {
    return null;
  }
}
