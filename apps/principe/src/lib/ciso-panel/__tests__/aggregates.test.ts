import { describe, it, expect } from "vitest";
import { computeAggregates, type PanelResponse } from "@/lib/ciso-panel/ask";

function mk(overrides: Partial<PanelResponse>): PanelResponse {
  return {
    index: 0,
    agentKey: "k",
    name: "n",
    region: "us",
    industry: "tech",
    companySize: "mid",
    tenure: "5y",
    stance: "balanced",
    verdict: "neutral",
    sentiment: 5,
    headline: "h",
    reasoning: "r",
    rawText: "{}",
    parseError: false,
    apiError: null,
    inputTokens: 10,
    outputTokens: 20,
    ...overrides,
  };
}

describe("computeAggregates", () => {
  it("counts verdicts and percentages", () => {
    const a = computeAggregates([
      mk({ verdict: "pro" }),
      mk({ verdict: "pro" }),
      mk({ verdict: "con" }),
      mk({ verdict: "neutral" }),
    ]);
    expect(a.proCount).toBe(2);
    expect(a.conCount).toBe(1);
    expect(a.neutralCount).toBe(1);
    expect(a.proPct).toBe(50);
    expect(a.conPct).toBe(25);
    expect(a.neutralPct).toBe(25);
  });

  it("computes the sentiment mean", () => {
    const a = computeAggregates([
      mk({ sentiment: 2 }),
      mk({ sentiment: 4 }),
      mk({ sentiment: 6 }),
    ]);
    expect(a.sentimentMean).toBeCloseTo(4, 5);
    expect(a.sentimentStdDev).toBeGreaterThan(0);
  });

  it("tallies api + parse failures separately", () => {
    const a = computeAggregates([
      mk({ apiError: "boom" }),
      mk({ parseError: true }),
      mk({ verdict: "pro" }),
    ]);
    expect(a.apiFailures).toBe(1);
    expect(a.parseFailures).toBe(1);
  });

  it("groups by region", () => {
    const a = computeAggregates([
      mk({ region: "us", verdict: "pro" }),
      mk({ region: "eu-west", verdict: "con" }),
    ]);
    expect(a.byRegion.us.pro).toBe(1);
    expect(a.byRegion["eu-west"].con).toBe(1);
  });
});
