// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Decision-grade output. Turns the raw panel into a single, honest call:
//   - a recommendation (stance + "% in favor" + a one-line rationale),
//   - an N-aware confidence band (Wilson interval — honest about small panels),
//   - the elevated dissent (the buy-blocking objection + the most-opposed segment).
//
// Design rule: every NUMBER here is computed server-side from the actual
// responses. The LLM supplies ONLY the prose `rationale`, so the stance label
// can never contradict the buy%.

import type { PanelResponse, PanelAggregates } from "./ask";
import { calibrate } from "./calibration-map";
import type { QuestionType } from "./question-router";
import type { PanelReview } from "./review";

// Claim-neutral stances — the panel votes pro/con on whatever the question
// proposes (a product to buy OR a strategy/claim to endorse), so the label is
// agreement-with-the-claim, not purchase intent.
export type DecisionStance =
  | "Strong Yes"
  | "Lean Yes"
  | "Split"
  | "Lean No"
  | "Strong No";

export interface DecisionRecommendation {
  stance: DecisionStance;
  /** % "in favor" = pro / total. Neutrals AND failed responses count as not-in-favor (conservative). */
  favorPct: number;
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
  /** Tier 2 — true only when the calibration map has enough data + a tight enough
   * band to trust this question-type's correction. False ⇒ treat as directional. */
  calibrated: boolean;
}

export interface DecisionDissent {
  /** Strongest buy-blocking objection (top con), or null if none. Kept for
   * back-compat with asks saved before `objections` existed. */
  objection: string | null;
  /** Top ranked objections (most buy-blocking first), up to 3. The wedge's
   * primary output — for a pitch question the objections matter more than the
   * favour-%, which is only directional until the type is calibrated. */
  objections: string[];
  /** Tier 1.5 — a risk/stakeholder/failure mode the whole panel missed, surfaced
   * by the adversarial review pass. Null when review didn't run or found none. */
  blindSpot?: string | null;
  /** Tier 1.5 — true when the review judged the dissenting case the stronger one. */
  minorityStronger?: boolean;
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

/**
 * Stance from the pro-vs-con BALANCE — not from "% in favor" alone. Neutrals
 * mean "no conviction", not "against": a mostly-neutral panel lands in Split or
 * a soft Lean, never "Strong". A "No" requires real opposition (con), not just
 * absence of support — so 30% pro / 8% con / 62% neutral is "Lean Yes", not
 * "Strong No". "Strong" requires an outright majority actively on one side.
 * Thresholds tunable in one place.
 */
export function stanceFor(proPct: number, conPct: number): DecisionStance {
  const net = proPct - conPct; // signed margin, in points
  if (proPct >= 50 && net >= 20) return "Strong Yes";
  if (conPct >= 50 && net <= -20) return "Strong No";
  if (net >= 10) return "Lean Yes";
  if (net <= -10) return "Lean No";
  return "Split";
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
  questionType?: QuestionType,
  review?: PanelReview,
): PanelDecision {
  const n = responses.length;
  // Reviewer-ranked objections when the review pass ran; else synthesiser order.
  const ranked = review?.objectionsRanked ?? topCons;
  const rawFavorPct = n > 0 ? Math.round((aggregates.proCount / n) * 100) : 0;
  const conPct = n > 0 ? Math.round((aggregates.conCount / n) * 100) : 0;
  // Tier 2 — apply the calibration map's per-type correction.
  const cal = calibrate(questionType ?? "PITCH", rawFavorPct);
  const favorPct = cal.calibratedPct;
  // Two uncertainties: sampling (Wilson, given N) and calibration (the map's
  // residual — how far the panel is from reality for this type). The honest
  // band is the LARGER of the two.
  const [lo, hi] = wilsonInterval(aggregates.proCount, n);
  const wilsonHalfPp = ((hi - lo) / 2) * 100;
  const halfWidthPp = Math.max(wilsonHalfPp, cal.bandHalfWidthPp);
  return {
    recommendation: {
      stance: stanceFor(favorPct, conPct),
      favorPct,
      rationale: rationale.trim() || `${favorPct}% of the panel is in favor.`,
    },
    confidence: {
      ci95: [
        Math.max(0, Math.round(favorPct - halfWidthPp)),
        Math.min(100, Math.round(favorPct + halfWidthPp)),
      ],
      bandHalfWidthPp: Math.round(halfWidthPp * 10) / 10,
      label: confidenceLabel(halfWidthPp),
      n,
      failedCount: aggregates.parseFailures + aggregates.apiFailures,
      belowFloor: n < PANEL_FLOOR,
      calibrated: cal.calibrated,
    },
    dissent: {
      // When the review ran, use its reviewer-ranked objections; else the
      // synthesiser's order.
      objection: ranked.length > 0 ? ranked[0] : null,
      objections: ranked.slice(0, 3),
      opposedSegment: mostOpposedSegment(aggregates, n),
      blindSpot: review?.blindSpot ?? null,
      minorityStronger: review?.minorityStronger ?? false,
    },
  };
}
