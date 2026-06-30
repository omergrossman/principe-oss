// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from "vitest";
import {
  computeViabilityScore,
  buildTrendContext,
  shouldTemperSynthesis,
  type RawTrendSignals,
} from "../trend-analysis";

// ---------------------------------------------------------------------------
// computeViabilityScore
// ---------------------------------------------------------------------------

describe("computeViabilityScore", () => {
  it("returns a number between 0 and 100", () => {
    const score = computeViabilityScore({
      panelAgreementRate: 0.7,
      trendAlignment: 0.6,
      vcMomentumScore: 0.8,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("strong panel + aligned trend + strong VC → high score (>= 70)", () => {
    const score = computeViabilityScore({
      panelAgreementRate: 0.8,
      trendAlignment: 0.75,
      vcMomentumScore: 0.9,
    });
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it("weak panel + misaligned trend + cooling VC → low score (< 40)", () => {
    const score = computeViabilityScore({
      panelAgreementRate: 0.3,
      trendAlignment: 0.2,
      vcMomentumScore: 0.1,
    });
    expect(score).toBeLessThan(40);
  });

  it("applies spec weights: panel 40%, trend 35%, vc 25%", () => {
    // All inputs equal → score should equal input × 100
    const score = computeViabilityScore({
      panelAgreementRate: 0.5,
      trendAlignment: 0.5,
      vcMomentumScore: 0.5,
    });
    expect(score).toBeCloseTo(50, 0);
  });
});

// ---------------------------------------------------------------------------
// buildTrendContext
// ---------------------------------------------------------------------------

describe("buildTrendContext", () => {
  const baseSignals: RawTrendSignals = {
    marketSaturation: "moderate",
    vcMomentum: "stable",
    timingSignal: "peak",
    trendAlignmentScore: 0.6,
    vcMomentumScore: 0.5,
    narrative: "The market is maturing with steady VC interest.",
  };

  it("returns a TrendContext with all required fields", () => {
    const ctx = buildTrendContext(baseSignals, 0.65, ["vendor_consolidation_priority"], "corpus-only");
    expect(ctx.marketSaturation).toBe("moderate");
    expect(ctx.vcMomentum).toBe("stable");
    expect(ctx.timingSignal).toBe("peak");
    expect(ctx.viabilityScore).toBeGreaterThanOrEqual(0);
    expect(ctx.viabilityScore).toBeLessThanOrEqual(100);
    expect(ctx.narrative).toBe("The market is maturing with steady VC interest.");
    expect(ctx.dataSource).toBe("corpus-only");
    expect(ctx.matchedCategories).toEqual(["vendor_consolidation_priority"]);
  });

  it("computes viabilityScore from the three weighted inputs", () => {
    const ctx = buildTrendContext(
      { ...baseSignals, trendAlignmentScore: 1.0, vcMomentumScore: 1.0 },
      1.0,
      [],
      "corpus-only",
    );
    expect(ctx.viabilityScore).toBeCloseTo(100, 0);
  });

  it("accepts corpus+updates as dataSource", () => {
    const ctx = buildTrendContext(baseSignals, 0.5, [], "corpus+updates");
    expect(ctx.dataSource).toBe("corpus+updates");
  });
});

// ---------------------------------------------------------------------------
// shouldTemperSynthesis
// ---------------------------------------------------------------------------

describe("shouldTemperSynthesis", () => {
  function ctx(overrides: Partial<ReturnType<typeof buildTrendContext>>) {
    return {
      marketSaturation: "low" as const,
      vcMomentum: "accelerating" as const,
      timingSignal: "early" as const,
      viabilityScore: 75,
      narrative: "",
      dataSource: "corpus-only" as const,
      matchedCategories: [],
      ...overrides,
    };
  }

  it("returns false when score is high and saturation is low", () => {
    expect(shouldTemperSynthesis(ctx({ viabilityScore: 75 }))).toBe(false);
  });

  it("returns true when viabilityScore < 60", () => {
    expect(shouldTemperSynthesis(ctx({ viabilityScore: 55 }))).toBe(true);
  });

  it("returns true when marketSaturation is high even with good score", () => {
    expect(shouldTemperSynthesis(ctx({ viabilityScore: 80, marketSaturation: "high" }))).toBe(true);
  });

  it("returns true when vcMomentum is cooling", () => {
    expect(shouldTemperSynthesis(ctx({ vcMomentum: "cooling" }))).toBe(true);
  });

  it("score exactly 60 does NOT trigger tempering (boundary)", () => {
    expect(shouldTemperSynthesis(ctx({ viabilityScore: 60 }))).toBe(false);
  });
});
