// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Decision-grade output. Turns the raw panel into a single, honest call:
//   - a recommendation (stance + "% would buy" + a one-line rationale),
//   - an N-aware confidence band (Wilson interval — honest about small panels),
//   - the elevated dissent (the buy-blocking objection + the most-opposed segment).
//
// Design rule: every NUMBER here is computed server-side from the actual
// responses. The LLM supplies ONLY the prose `rationale`, so the stance label
// can never contradict the buy%.

import type { PanelResponse, PanelAggregates } from "./ask";

export type DecisionStance = "Buy" | "Lean Buy" | "Split" | "Lean No" | "No";

export interface DecisionRecommendation {
  stance: DecisionStance;
  /** pro / total — neutrals AND failed responses count as "not a yes" (conservative). */
  buyPct: number;
  /** One line from the LLM (or a server fallback). Narrative only — never the number. */
  rationale: string;
}

export interface DecisionConfidence {
  /** Wilson 95% CI on the buy%, in percentage points. */
  ci95: [number, number];
  bandHalfWidthPp: number;
  label: "High" | "Moderate" | "Low";
  n: number;
  failedCount: number;
  /** n below the statistical-viability floor — the result is directional only. */
  belowFloor: boolean;
}

export interface DecisionDissent {
  /** Strongest buy-blocking objection (top con), or null if none. */
  objection: string | null;
  /** The segment most opposed to buying, or null if there's no material dissent. */
  opposedSegment: { label: string; conPct: number; n: number } | null;
}

export interface PanelDecision {
  recommendation: DecisionRecommendation;
  confidence: DecisionConfidence;
  dissent: DecisionDissent;
}

export const PANEL_FLOOR = 30;
const Z = 1.96; // 95%

/**
 * Wilson score interval for a binomial proportion — returns [lo, hi] in 0–1.
 * Chosen over the normal approximation because it stays inside [0,1] and is
 * non-degenerate at p=0 and p=1 (where the panel is unanimous).
 */
export function wilsonInterval(successes: number, n: number, z = Z): [number, number] {
  if (n <= 0) return [0, 1];
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

/** Stance from the buy% — fixed thresholds, tunable in one place. */
export function stanceFor(buyPct: number): DecisionStance {
  if (buyPct >= 66) return "Buy";
  if (buyPct >= 55) return "Lean Buy";
  if (buyPct >= 45) return "Split";
  if (buyPct >= 34) return "Lean No";
  return "No";
}

/** High/Moderate/Low from the CI half-width. Tunable cutoffs (D3). */
export function confidenceLabel(halfWidthPp: number): DecisionConfidence["label"] {
  if (halfWidthPp <= 5) return "High";
  if (halfWidthPp <= 12) return "Moderate";
  return "Low";
}

/**
 * Most-opposed segment across region / industry / stance, with a min-n guard so
 * a lone dissenter in a tiny segment can't be flagged as "the" opposition. Only
 * surfaced when the segment is majority-con (≥50%), else there's no material dissent.
 */
function mostOpposedSegment(
  agg: PanelAggregates,
  n: number,
): DecisionDissent["opposedSegment"] {
  const minN = Math.max(3, Math.round(n * 0.1));
  const candidates: { label: string; conPct: number; n: number }[] = [];
  const scan = (
    groups: Record<string, { pro: number; con: number; neutral: number }>,
    kind: string,
  ) => {
    for (const [label, c] of Object.entries(groups)) {
      const segN = c.pro + c.con + c.neutral;
      if (segN < minN) continue;
      candidates.push({
        label: `${label} (${kind})`,
        conPct: Math.round((c.con / segN) * 100),
        n: segN,
      });
    }
  };
  scan(agg.byRegion, "region");
  scan(agg.byIndustry, "industry");
  scan(agg.byStance, "stance");
  if (candidates.length === 0) return null;
  const best = candidates.reduce((a, b) => (b.conPct > a.conPct ? b : a));
  // Only surface as dissent when the segment is majority-con.
  return best.conPct >= 50 ? best : null;
}

export function computeDecision(
  responses: PanelResponse[],
  aggregates: PanelAggregates,
  topCons: string[],
  rationale: string,
): PanelDecision {
  const n = responses.length;
  const buyFrac = n > 0 ? aggregates.proCount / n : 0; // D2: pro / total
  const buyPct = Math.round(buyFrac * 100);
  const [lo, hi] = wilsonInterval(aggregates.proCount, n);
  const halfWidthPp = ((hi - lo) / 2) * 100;
  return {
    recommendation: {
      stance: stanceFor(buyPct),
      buyPct,
      rationale: rationale.trim() || `${buyPct}% of the panel would buy.`,
    },
    confidence: {
      ci95: [Math.round(lo * 100), Math.round(hi * 100)],
      bandHalfWidthPp: Math.round(halfWidthPp * 10) / 10,
      label: confidenceLabel(halfWidthPp),
      n,
      failedCount: aggregates.parseFailures + aggregates.apiFailures,
      belowFloor: n < PANEL_FLOOR,
    },
    dissent: {
      objection: topCons.length > 0 ? topCons[0] : null,
      opposedSegment: mostOpposedSegment(aggregates, n),
    },
  };
}
