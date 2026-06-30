// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { buildSynthesisUserPayload } from "../synthesize";
import type { PanelAggregates } from "../ask";
import type { TrendContext } from "../trend-analysis";

// Minimal stub aggregates — only fields read by buildSynthesisUserPayload.
function agg(overrides: Partial<PanelAggregates> = {}): PanelAggregates {
  return {
    proCount: 60,
    conCount: 25,
    neutralCount: 15,
    proPct: 60,
    conPct: 25,
    neutralPct: 15,
    sentimentMean: 6.5,
    sentimentStdDev: 1.2,
    spreadLabel: "moderate spread",
    byRegion: {},
    byIndustry: {},
    byStance: {},
    parseFailures: 0,
    apiFailures: 0,
    ...overrides,
  };
}

function ctx(overrides: Partial<TrendContext> = {}): TrendContext {
  return {
    marketSaturation: "moderate",
    vcMomentum: "stable",
    timingSignal: "peak",
    viabilityScore: 72,
    narrative: "Steady market with moderate VC interest.",
    dataSource: "corpus-only",
    matchedCategories: ["vendor_consolidation_priority"],
    ...overrides,
  };
}

const QUESTION = "Should we build an AI-based threat detection product?";
const COMPACT: object[] = [{ name: "Alex Chen", region: "us", verdict: "pro" }];

// ---------------------------------------------------------------------------
// No TrendContext — payload is clean
// ---------------------------------------------------------------------------

describe("buildSynthesisUserPayload — no trend context", () => {
  it("does not inject a market context block when trendContext is null", () => {
    const payload = buildSynthesisUserPayload(QUESTION, agg(), COMPACT, null);
    expect(payload).not.toContain("MARKET TREND CONTEXT");
  });

  it("includes the founder question and aggregate stats", () => {
    const payload = buildSynthesisUserPayload(QUESTION, agg(), COMPACT, null);
    expect(payload).toContain("FOUNDER'S QUESTION:");
    expect(payload).toContain(QUESTION);
    expect(payload).toContain("AGGREGATE STATS:");
  });
});

// ---------------------------------------------------------------------------
// TrendContext present but tempering NOT warranted — no injection
// ---------------------------------------------------------------------------

describe("buildSynthesisUserPayload — high-viability context, no tempering", () => {
  it("does not inject market context when score >= 60 and saturation is low/moderate", () => {
    const payload = buildSynthesisUserPayload(
      QUESTION,
      agg(),
      COMPACT,
      ctx({ viabilityScore: 75, marketSaturation: "moderate", vcMomentum: "stable" }),
    );
    expect(payload).not.toContain("MARKET TREND CONTEXT");
  });

  it("does not inject when score is exactly 60 (boundary — no tempering at 60)", () => {
    const payload = buildSynthesisUserPayload(
      QUESTION,
      agg(),
      COMPACT,
      ctx({ viabilityScore: 60, marketSaturation: "low", vcMomentum: "accelerating" }),
    );
    expect(payload).not.toContain("MARKET TREND CONTEXT");
  });
});

// ---------------------------------------------------------------------------
// Tempering rules fire — market context injected
// ---------------------------------------------------------------------------

describe("buildSynthesisUserPayload — tempering injection", () => {
  it("injects market context and 'market risk' instruction when viabilityScore < 60", () => {
    const payload = buildSynthesisUserPayload(
      QUESTION,
      agg(),
      COMPACT,
      ctx({ viabilityScore: 45, marketSaturation: "low", vcMomentum: "stable" }),
    );
    expect(payload).toContain("MARKET TREND CONTEXT");
    expect(payload).toContain("market risk");
  });

  it("injects crowding language when marketSaturation is high", () => {
    const payload = buildSynthesisUserPayload(
      QUESTION,
      agg(),
      COMPACT,
      ctx({ viabilityScore: 80, marketSaturation: "high", vcMomentum: "stable" }),
    );
    expect(payload).toContain("MARKET TREND CONTEXT");
    expect(payload).toContain("crowding");
  });

  it("injects timing risk language when vcMomentum is cooling", () => {
    const payload = buildSynthesisUserPayload(
      QUESTION,
      agg(),
      COMPACT,
      ctx({ viabilityScore: 80, marketSaturation: "low", vcMomentum: "cooling" }),
    );
    expect(payload).toContain("MARKET TREND CONTEXT");
    expect(payload).toContain("timing risk");
  });

  it("includes the viabilityScore and narrative in the injected block", () => {
    const narrative = "The space is crowded with 12 funded vendors.";
    const payload = buildSynthesisUserPayload(
      QUESTION,
      agg(),
      COMPACT,
      ctx({ viabilityScore: 38, narrative, marketSaturation: "high" }),
    );
    expect(payload).toContain("38");
    expect(payload).toContain(narrative);
  });
});
