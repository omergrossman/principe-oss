// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Tier 2 — the calibration map. Corrects the panel's raw "% in favor" for the
// known per-question-type systematic bias, learned from paired (panel%, real%)
// points, and derives an HONEST confidence band from the map's residual spread.
//
// Design principle (the GA-gate's "confidence honesty"): with little data the
// correction shrinks toward identity and the band is WIDE — i.e. the map says
// "not calibrated yet, treat as directional" rather than faking precision. As
// paired points accumulate (more tagged surveys + the design-partner gold bank
// run through the harness), corrections sharpen and bands narrow automatically.

import type { QuestionType } from "./question-router";

export interface PairedPoint {
  type: QuestionType;
  raw: number; // panel "% in favor"
  real: number; // real-survey "% in favor"
  note?: string;
}

export interface TypeCorrection {
  type: QuestionType;
  n: number;
  offset: number; // raw mean(real - raw)
  shrunkOffset: number; // shrunk toward 0 by sample size
  residualSd: number; // sd of (real - corrected) — drives the band
}

export interface CalibratedResult {
  calibratedPct: number;
  bandHalfWidthPp: number;
  /** true only when we have enough paired data AND the band is tight enough to trust. */
  calibrated: boolean;
}

// Shrink the offset toward 0 with this pseudo-count: shrunk = offset * n/(n+k).
// n=0 → identity; small n → conservative; large n → trust the data.
const SHRINK_K = 5;
// Floor on the band even with good data (no panel is perfect).
const BAND_FLOOR_PP = 6;
// Small-sample band penalty: scale * k/(n+k) — large when n is small.
const THIN_PENALTY_PP = 25;
// We only claim "calibrated" (vs directional) above this n and below this band.
const MIN_N_FOR_CALIBRATED = 6;
const MAX_BAND_FOR_CALIBRATED = 18;

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) * (x - m))));
}
const clamp = (x: number) => Math.max(0, Math.min(100, x));

/** Fit a per-type mean-offset correction (with shrinkage) from paired points. */
export function fitCorrections(points: PairedPoint[]): Record<string, TypeCorrection> {
  const byType = new Map<QuestionType, PairedPoint[]>();
  for (const p of points) {
    const arr = byType.get(p.type) ?? [];
    arr.push(p);
    byType.set(p.type, arr);
  }
  const out: Record<string, TypeCorrection> = {};
  for (const [type, pts] of byType) {
    const n = pts.length;
    const offset = mean(pts.map((p) => p.real - p.raw));
    const shrunkOffset = offset * (n / (n + SHRINK_K));
    const residualSd = sd(pts.map((p) => p.real - clamp(p.raw + shrunkOffset)));
    out[type] = { type, n, offset, shrunkOffset, residualSd };
  }
  return out;
}

/** Apply a correction (or identity if none) and return the calibrated % + honest band. */
export function applyCorrection(
  corr: TypeCorrection | undefined,
  rawPct: number,
): CalibratedResult {
  if (!corr || corr.n < 2) {
    // No usable data for this type → identity, with a wide "uncalibrated" band.
    return { calibratedPct: clamp(rawPct), bandHalfWidthPp: 30, calibrated: false };
  }
  const calibratedPct = clamp(rawPct + corr.shrunkOffset);
  const thinPenalty = THIN_PENALTY_PP * (SHRINK_K / (corr.n + SHRINK_K));
  const bandHalfWidthPp = Math.round(
    Math.max(BAND_FLOOR_PP, Math.sqrt(corr.residualSd ** 2 + thinPenalty ** 2)),
  );
  const calibrated =
    corr.n >= MIN_N_FOR_CALIBRATED && bandHalfWidthPp <= MAX_BAND_FOR_CALIBRATED;
  return { calibratedPct: Math.round(calibratedPct), bandHalfWidthPp, calibrated };
}

// ── Seed paired data ────────────────────────────────────────────────────────
// EARLY + THIN, on purpose. Global-panel-vs-Glilot points only (consistent
// composition). PRIORITY's huge residual is the real finding: the panel can't
// yet be trusted on priority questions → the band stays wide → "directional".
// Expand this (more tagged surveys + global pitch data from the gold bank); the
// fit + bands update automatically. PITCH/STRATEGY/FACTUAL: no global paired
// data yet → identity + wide band until collected.
export const SEED_POINTS: PairedPoint[] = [
  { type: "PRIORITY", raw: 32, real: 41, note: "glilot: budget for AI task-automation" },
  { type: "PRIORITY", raw: 26, real: 56, note: "glilot: securing AI-generated code" },
  { type: "PRIORITY", raw: 100, real: 48, note: "glilot: govern own AI usage" },
  { type: "PRIORITY", raw: 64, real: 78, note: "glilot: invest in AI security tools" },
  { type: "PRIORITY", raw: 82, real: 51, note: "glilot: detect AI-driven attacks" },
  { type: "FORECAST", raw: 16, real: 59, note: "glilot: AI-for-defense standard by 2026" },
  // Global multi-survey points (Proofpoint VoC 2025, Foundry 2026, Cisco RI 2025),
  // run through the ORIGINAL global panel via scripts/calibration-references.ts.
  // The KEY finding: the panel's bias is NOT a clean per-type offset. Within a
  // single type the panel swings from 0% to 100% on different questions (Glilot
  // "govern own AI" panel=100 vs Proofpoint "GenAI a priority" panel=0, both
  // PRIORITY). So pooling these widens the residual rather than sharpening the
  // offset — the map correctly keeps these types "directional" (wide band). The
  // root cause is over-unanimity + missing org-self-knowledge in the panel, which
  // an affine correction can't fix; it must be addressed at the panel layer.
  { type: "PRIORITY", raw: 0, real: 64, note: "proofpoint: GenAI enablement a strategic priority" },
  { type: "PRIORITY", raw: 0, real: 48, note: "foundry: data protection top priority" },
  { type: "PRIORITY", raw: 24, real: 73, note: "foundry: more likely to consider AI-enabled tools" },
  { type: "FORECAST", raw: 62, real: 76, note: "proofpoint: at risk of material attack in 12mo" },
  { type: "STRATEGY", raw: 0, real: 66, note: "proofpoint: would consider paying a ransom" },
  { type: "FACTUAL", raw: 100, real: 60, note: "proofpoint: regard GenAI as a security risk" },
  { type: "FACTUAL", raw: 94, real: 76, note: "foundry: harder to choose the right tools" },
  { type: "FACTUAL", raw: 0, real: 34, note: "cisco: very confident in resilience" },
  { type: "FACTUAL", raw: 2, real: 89, note: "cisco: org uses AI to understand threats" },
  { type: "FACTUAL", raw: 0, real: 45, note: "cisco: internal resources for AI security assessments" },
];

export const CORRECTIONS = fitCorrections(SEED_POINTS);

/** Convenience: calibrate a raw % for a question type using the seed corrections. */
export function calibrate(type: QuestionType, rawPct: number): CalibratedResult {
  return applyCorrection(CORRECTIONS[type], rawPct);
}
