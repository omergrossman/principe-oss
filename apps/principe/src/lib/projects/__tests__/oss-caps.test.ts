// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { INDUSTRIES } from "@/lib/canon";
import { normaliseComposition, DEFAULT_COMPOSITION } from "@/lib/projects/composition";
import {
  SELF_HOSTED_PANEL_SIZE,
  SELF_HOSTED_MAX_INDUSTRIES,
} from "@/lib/projects/repo";

/**
 * Enforce the OSS / self-hosted pricing-page promise in code:
 *   - 30-CISO panels, fixed.
 *   - up to 10 of the 24-industry catalogue.
 *   - industries are canonical-only (users can't invent one).
 *
 * The 10-industry hard cap and the fixed-30 panel size live in
 * createProject() (which touches Prisma, so isn't unit-tested here). These
 * tests cover the pure pieces: the canonical industry filter in
 * normaliseComposition, plus assertions on the exported build constants.
 */
describe("OSS self-hosted caps", () => {
  it("fixes the panel size at 30 (build constant, no runtime tier lookup)", () => {
    // createProject() ignores input.panelSize and always uses this constant.
    expect(SELF_HOSTED_PANEL_SIZE).toBe(30);
  });

  it("caps industries at 10 of the 24-industry catalogue", () => {
    expect(SELF_HOSTED_MAX_INDUSTRIES).toBe(10);
    expect(INDUSTRIES.length).toBe(24);
  });

  it("keeps canonical industries through normalisation", () => {
    const canonical = [INDUSTRIES[0], INDUSTRIES[5], INDUSTRIES[12]];
    const result = normaliseComposition({
      ...DEFAULT_COMPOSITION,
      industries: canonical,
    });
    expect(result.industries.sort()).toEqual([...canonical].sort());
  });

  it("drops non-canonical (invented) industries", () => {
    const result = normaliseComposition({
      ...DEFAULT_COMPOSITION,
      industries: ["Banks", "Totally Made Up Industry", "Insurance", ""],
    });
    expect(result.industries).toEqual(["Banks", "Insurance"]);
    expect(result.industries).not.toContain("Totally Made Up Industry");
  });

  it("dedupes and sorts canonical industries", () => {
    const result = normaliseComposition({
      ...DEFAULT_COMPOSITION,
      industries: ["Insurance", "Banks", "Insurance"],
    });
    expect(result.industries).toEqual(["Banks", "Insurance"]);
  });
});
