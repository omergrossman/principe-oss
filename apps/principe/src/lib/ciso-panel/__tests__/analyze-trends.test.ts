// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { parseAnalyzeTrendsResponse } from "../trend-analysis";

// ---------------------------------------------------------------------------
// parseAnalyzeTrendsResponse — pure JSON parser for the Haiku LLM output
// ---------------------------------------------------------------------------

describe("parseAnalyzeTrendsResponse", () => {
  it("parses a well-formed JSON response into RawTrendSignals", () => {
    const text = JSON.stringify({
      marketSaturation: "moderate",
      vcMomentum: "accelerating",
      timingSignal: "peak",
      trendAlignmentScore: 0.72,
      vcMomentumScore: 0.85,
      narrative: "Strong VC interest in the identity security space.",
    });
    const result = parseAnalyzeTrendsResponse(text);
    expect(result).not.toBeNull();
    expect(result!.marketSaturation).toBe("moderate");
    expect(result!.vcMomentum).toBe("accelerating");
    expect(result!.timingSignal).toBe("peak");
    expect(result!.trendAlignmentScore).toBe(0.72);
    expect(result!.vcMomentumScore).toBe(0.85);
    expect(result!.narrative).toBe("Strong VC interest in the identity security space.");
  });

  it("strips markdown code fences if the LLM wraps the JSON", () => {
    const text = "```json\n" + JSON.stringify({
      marketSaturation: "high",
      vcMomentum: "cooling",
      timingSignal: "late",
      trendAlignmentScore: 0.3,
      vcMomentumScore: 0.2,
      narrative: "Market is saturated.",
    }) + "\n```";
    const result = parseAnalyzeTrendsResponse(text);
    expect(result).not.toBeNull();
    expect(result!.marketSaturation).toBe("high");
  });

  it("returns null for empty string", () => {
    expect(parseAnalyzeTrendsResponse("")).toBeNull();
  });

  it("returns null when the JSON is missing required fields", () => {
    const text = JSON.stringify({ marketSaturation: "low" });
    expect(parseAnalyzeTrendsResponse(text)).toBeNull();
  });

  it("returns null when trendAlignmentScore is out of 0-1 range", () => {
    const text = JSON.stringify({
      marketSaturation: "low",
      vcMomentum: "stable",
      timingSignal: "early",
      trendAlignmentScore: 1.5,
      vcMomentumScore: 0.5,
      narrative: "n/a",
    });
    expect(parseAnalyzeTrendsResponse(text)).toBeNull();
  });

  it("returns null when vcMomentumScore is out of 0-1 range", () => {
    const text = JSON.stringify({
      marketSaturation: "low",
      vcMomentum: "stable",
      timingSignal: "early",
      trendAlignmentScore: 0.5,
      vcMomentumScore: -0.1,
      narrative: "n/a",
    });
    expect(parseAnalyzeTrendsResponse(text)).toBeNull();
  });

  it("returns null when marketSaturation is not a valid enum value", () => {
    const text = JSON.stringify({
      marketSaturation: "exploding",
      vcMomentum: "stable",
      timingSignal: "early",
      trendAlignmentScore: 0.5,
      vcMomentumScore: 0.5,
      narrative: "n/a",
    });
    expect(parseAnalyzeTrendsResponse(text)).toBeNull();
  });

  it("returns null for unparseable JSON", () => {
    expect(parseAnalyzeTrendsResponse("{not valid json}")).toBeNull();
  });

  it("extracts JSON embedded in prose (model forgot the no-prose rule)", () => {
    const inner = JSON.stringify({
      marketSaturation: "low",
      vcMomentum: "accelerating",
      timingSignal: "early",
      trendAlignmentScore: 0.9,
      vcMomentumScore: 0.95,
      narrative: "Emerging space.",
    });
    const text = `Here is the analysis:\n${inner}\nHope that helps.`;
    const result = parseAnalyzeTrendsResponse(text);
    expect(result).not.toBeNull();
    expect(result!.vcMomentum).toBe("accelerating");
  });
});
