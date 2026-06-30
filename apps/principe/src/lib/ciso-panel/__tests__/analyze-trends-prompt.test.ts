// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { buildAnalyzeTrendsPrompt } from "../trend-analysis";
import type { PanelAggregates } from "../ask";

function agg(overrides: Partial<PanelAggregates> = {}): PanelAggregates {
  return {
    proCount: 65,
    conCount: 20,
    neutralCount: 15,
    proPct: 65,
    conPct: 20,
    neutralPct: 15,
    sentimentMean: 6.8,
    sentimentStdDev: 1.1,
    spreadLabel: "moderate spread",
    byRegion: {},
    byIndustry: {},
    byStance: {},
    parseFailures: 0,
    apiFailures: 0,
    ...overrides,
  };
}

type KnowledgeSnippet = { title: string; content: string | null };

const QUESTION = "Should we build an AI-based threat detection product?";
const CATEGORIES = ["identity_security_spend", "vendor_consolidation_priority"];

// ---------------------------------------------------------------------------
// Baseline — no knowledge sources
// ---------------------------------------------------------------------------

describe("buildAnalyzeTrendsPrompt — no knowledge sources", () => {
  it("includes the question", () => {
    const prompt = buildAnalyzeTrendsPrompt(QUESTION, agg(), CATEGORIES, []);
    expect(prompt).toContain(QUESTION);
  });

  it("includes panel agreement rate stats", () => {
    const prompt = buildAnalyzeTrendsPrompt(QUESTION, agg(), CATEGORIES, []);
    expect(prompt).toContain("65%");
    expect(prompt).toContain("PANEL AGREEMENT RATE");
  });

  it("includes matched calibration categories", () => {
    const prompt = buildAnalyzeTrendsPrompt(QUESTION, agg(), CATEGORIES, []);
    expect(prompt).toContain("identity_security_spend");
    expect(prompt).toContain("vendor_consolidation_priority");
  });

  it("does NOT include a MARKET KNOWLEDGE SOURCES section when array is empty", () => {
    const prompt = buildAnalyzeTrendsPrompt(QUESTION, agg(), CATEGORIES, []);
    expect(prompt).not.toContain("MARKET KNOWLEDGE SOURCES");
  });
});

// ---------------------------------------------------------------------------
// With knowledge sources
// ---------------------------------------------------------------------------

describe("buildAnalyzeTrendsPrompt — with knowledge sources", () => {
  const sources: KnowledgeSnippet[] = [
    { title: "Glilot Cyber Report 2025", content: "Identity security continues to attract the largest deal sizes in 2025, with average Series B rounds exceeding $40M. Consolidation pressure is high." },
    { title: "Team8 CISO Survey", content: "78% of CISOs plan to increase identity security spend over the next 12 months, driven by zero-trust adoption mandates." },
  ];

  it("includes a MARKET KNOWLEDGE SOURCES section", () => {
    const prompt = buildAnalyzeTrendsPrompt(QUESTION, agg(), CATEGORIES, sources);
    expect(prompt).toContain("MARKET KNOWLEDGE SOURCES");
  });

  it("includes each source title", () => {
    const prompt = buildAnalyzeTrendsPrompt(QUESTION, agg(), CATEGORIES, sources);
    expect(prompt).toContain("Glilot Cyber Report 2025");
    expect(prompt).toContain("Team8 CISO Survey");
  });

  it("includes source content", () => {
    const prompt = buildAnalyzeTrendsPrompt(QUESTION, agg(), CATEGORIES, sources);
    expect(prompt).toContain("Identity security continues");
    expect(prompt).toContain("78% of CISOs");
  });

  it("truncates content longer than 400 characters", () => {
    const longContent = "A".repeat(600);
    const prompt = buildAnalyzeTrendsPrompt(QUESTION, agg(), CATEGORIES, [
      { title: "Long Report", content: longContent },
    ]);
    // Should contain truncated content (400 chars of A's) but not the full 600
    expect(prompt).toContain("A".repeat(400));
    expect(prompt).not.toContain("A".repeat(401));
  });

  it("handles a null content field gracefully (skips the source)", () => {
    const prompt = buildAnalyzeTrendsPrompt(QUESTION, agg(), CATEGORIES, [
      { title: "No Content", content: null },
    ]);
    // The MARKET KNOWLEDGE SOURCES section is still rendered (title is there),
    // but null content doesn't crash and produces empty snippet.
    expect(prompt).not.toThrowError;
  });

  it("knowledge section appears after the stats, before the end", () => {
    const prompt = buildAnalyzeTrendsPrompt(QUESTION, agg(), CATEGORIES, sources);
    const statsIdx = prompt.indexOf("PANEL AGREEMENT RATE");
    const knowledgeIdx = prompt.indexOf("MARKET KNOWLEDGE SOURCES");
    expect(statsIdx).toBeGreaterThanOrEqual(0);
    expect(knowledgeIdx).toBeGreaterThan(statsIdx);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("buildAnalyzeTrendsPrompt — edge cases", () => {
  it("handles empty categories array", () => {
    const prompt = buildAnalyzeTrendsPrompt(QUESTION, agg(), [], []);
    expect(prompt).toContain("MATCHED CALIBRATION CATEGORIES");
    expect(prompt).toContain("none");
  });

  it("handles a source with empty string content (renders section, empty body)", () => {
    const prompt = buildAnalyzeTrendsPrompt(QUESTION, agg(), CATEGORIES, [
      { title: "Empty Body", content: "" },
    ]);
    expect(prompt).toContain("MARKET KNOWLEDGE SOURCES");
    expect(prompt).toContain("Empty Body");
  });
});
