// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from "vitest";
import {
  parseAskHistory,
  renderAskHistorySection,
  type AskHistoryEntry,
} from "../ask-history";

function entry(i: number, o: Partial<AskHistoryEntry> = {}): AskHistoryEntry {
  return {
    askId: `ask-${i}`,
    q: `question ${i}`,
    v: "pro",
    h: `headline ${i}`,
    askedAt: `2026-06-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
    rsn: `reasoning for ${i}`,
    s: 7,
    ...o,
  };
}

describe("renderAskHistorySection — persona memory", () => {
  it("returns empty string for no history", () => {
    expect(renderAskHistorySection([])).toBe("");
  });

  it("injects the persona's own reasoning for recent entries", () => {
    const out = renderAskHistorySection([entry(1)]);
    expect(out).toContain("reasoning for 1");
    expect(out).toContain("PRO");
  });

  it("bounds tokens: only the 5 most-recent carry reasoning; older collapse to one line", () => {
    const entries = Array.from({ length: 8 }, (_, i) => entry(i)); // newest first by caller convention
    const out = renderAskHistorySection(entries);
    // First 5 → reasoning present.
    expect(out).toContain("reasoning for 0");
    expect(out).toContain("reasoning for 4");
    // 6th+ → collapsed: their reasoning must NOT appear, and the "Earlier" header shows.
    expect(out).toContain("Earlier in this project:");
    expect(out).not.toContain("reasoning for 5");
    expect(out).not.toContain("reasoning for 7");
  });

  it("falls back to the headline for legacy entries with no reasoning", () => {
    const out = renderAskHistorySection([entry(1, { rsn: undefined })]);
    expect(out).toContain("headline 1");
  });

  it("keeps the consistency/flip guidance", () => {
    const out = renderAskHistorySection([entry(1)]);
    expect(out).toContain("EVOLUTION IS THE EXCEPTION");
  });
});

describe("parseAskHistory", () => {
  it("retains the new sentiment + reasoning fields", () => {
    const parsed = parseAskHistory([entry(1)]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].rsn).toBe("reasoning for 1");
    expect(parsed[0].s).toBe(7);
  });

  it("still parses legacy entries that lack the new fields", () => {
    const legacy = { askId: "a", q: "q", v: "con", h: "h", askedAt: "2026-06-01T00:00:00Z" };
    const parsed = parseAskHistory([legacy]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].rsn).toBeUndefined();
  });
});
