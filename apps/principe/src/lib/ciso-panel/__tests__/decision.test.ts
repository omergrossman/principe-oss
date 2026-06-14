// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from "vitest";
import {
  wilsonInterval,
  stanceFor,
  confidenceLabel,
  computeDecision,
} from "../decision";
import type { PanelResponse, PanelAggregates } from "../ask";

// computeDecision only reads responses.length; stub the rest.
function responses(n: number): PanelResponse[] {
  return Array.from({ length: n }, (_, i) => ({ index: i }) as unknown as PanelResponse);
}

function agg(o: Partial<PanelAggregates> = {}): PanelAggregates {
  return {
    proCount: 0,
    conCount: 0,
    neutralCount: 0,
    proPct: 0,
    conPct: 0,
    neutralPct: 0,
    sentimentMean: 5,
    sentimentStdDev: 0,
    spreadLabel: "tight consensus",
    byRegion: {},
    byIndustry: {},
    byStance: {},
    parseFailures: 0,
    apiFailures: 0,
    ...o,
  };
}

describe("wilsonInterval", () => {
  it("stays within [0,1] and is non-degenerate at p=0", () => {
    const [lo, hi] = wilsonInterval(0, 30);
    expect(lo).toBe(0);
    expect(hi).toBeGreaterThan(0);
    expect(hi).toBeLessThan(1);
  });

  it("stays within [0,1] and is non-degenerate at p=1", () => {
    const [lo, hi] = wilsonInterval(30, 30);
    expect(hi).toBe(1);
    expect(lo).toBeGreaterThan(0);
    expect(lo).toBeLessThan(1);
  });

  it("is N-aware: a larger panel yields a narrower band at the same proportion", () => {
    const small = wilsonInterval(15, 30); // 50%, N=30
    const large = wilsonInterval(100, 200); // 50%, N=200
    const wSmall = small[1] - small[0];
    const wLarge = large[1] - large[0];
    expect(wLarge).toBeLessThan(wSmall);
  });
});

describe("stanceFor", () => {
  it("maps % in favor to the five stances at the thresholds", () => {
    expect(stanceFor(80)).toBe("Strong Yes");
    expect(stanceFor(66)).toBe("Strong Yes");
    expect(stanceFor(60)).toBe("Lean Yes");
    expect(stanceFor(50)).toBe("Split");
    expect(stanceFor(40)).toBe("Lean No");
    expect(stanceFor(33)).toBe("Strong No");
    expect(stanceFor(0)).toBe("Strong No");
  });
});

describe("confidenceLabel", () => {
  it("maps half-width to High/Moderate/Low", () => {
    expect(confidenceLabel(4)).toBe("High");
    expect(confidenceLabel(5)).toBe("High");
    expect(confidenceLabel(10)).toBe("Moderate");
    expect(confidenceLabel(13)).toBe("Low");
  });
});

describe("computeDecision", () => {
  it("favor% = pro / total (neutrals + failures count as not-in-favor)", () => {
    // 17 pro out of 50 total → 34% → Lean No
    const d = computeDecision(responses(50), agg({ proCount: 17, conCount: 20, neutralCount: 13 }), [], "");
    expect(d.recommendation.favorPct).toBe(34);
    expect(d.recommendation.stance).toBe("Lean No");
    expect(d.confidence.belowFloor).toBe(false);
  });

  it("flags below-floor panels", () => {
    const d = computeDecision(responses(20), agg({ proCount: 10 }), [], "");
    expect(d.confidence.belowFloor).toBe(true);
  });

  it("surfaces the top con as the objection and never the LLM's number", () => {
    const d = computeDecision(
      responses(40),
      agg({ proCount: 30 }),
      ["Integration risk is too high", "Pricing unclear"],
      "Lean buy: most would adopt.",
    );
    expect(d.dissent.objection).toBe("Integration risk is too high");
    expect(d.recommendation.rationale).toBe("Lean buy: most would adopt.");
    expect(d.recommendation.favorPct).toBe(75); // computed, not from prose
  });

  it("names a majority-con segment, with a min-n guard", () => {
    const d = computeDecision(
      responses(40),
      agg({
        proCount: 20,
        byRegion: {
          "eu-west": { pro: 2, con: 10, neutral: 0 }, // 83% con, n=12 ≥ guard
          "us": { pro: 18, con: 2, neutral: 8 },
          "anz": { pro: 0, con: 1, neutral: 0 }, // n=1 < guard → ignored
        },
      }),
      [],
      "",
    );
    expect(d.dissent.opposedSegment?.label).toBe("eu-west (region)");
    expect(d.dissent.opposedSegment?.conPct).toBe(83);
  });

  it("reports no material dissent when nothing is majority-con", () => {
    const d = computeDecision(
      responses(40),
      agg({ proCount: 35, byRegion: { us: { pro: 30, con: 3, neutral: 7 } } }),
      [],
      "",
    );
    expect(d.dissent.opposedSegment).toBeNull();
  });
});
