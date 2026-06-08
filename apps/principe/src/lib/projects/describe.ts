// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  REGION_KEYS,
  SIZE_BANDS,
  STANCE_KEYS,
  type PanelComposition,
  type StanceKey,
} from "./composition";

/**
 * Human-readable composition summary for the workspace subtitle.
 *
 * For the Default project (composition === null) we report the
 * canonical Sprint-1 numbers — those are deterministic + known. For
 * any other project we compute live from the stored composition.
 */
export interface CompositionSummary {
  regionsCount: number;
  industriesCount: number;
  sizesCount: number;
  /** Either "all 4 stances" or "median stance <name>" depending on shape. */
  stanceLabel: string;
}

const TOTAL_INDUSTRIES = 24;
const TOTAL_REGIONS = REGION_KEYS.length;
const TOTAL_SIZES = SIZE_BANDS.length;
const TOTAL_STANCES = STANCE_KEYS.length;

export function describeComposition(
  composition: PanelComposition | null,
): CompositionSummary {
  if (!composition) {
    return {
      regionsCount: TOTAL_REGIONS,
      industriesCount: TOTAL_INDUSTRIES,
      sizesCount: TOTAL_SIZES,
      stanceLabel: `all ${TOTAL_STANCES} stances`,
    };
  }

  const regionsCount = Object.values(composition.regionWeights).filter(
    (w) => (w ?? 0) > 0,
  ).length;

  const industriesCount =
    composition.industries.length > 0
      ? composition.industries.length
      : TOTAL_INDUSTRIES;

  const minIdx = SIZE_BANDS.indexOf(composition.sizeMin);
  const maxIdx = SIZE_BANDS.indexOf(composition.sizeMax);
  const sizesCount = Math.max(1, maxIdx - minIdx + 1);

  // Dominant stance = the key with the largest weight. If all four are
  // equal (e.g. forced default), label as "balanced mix."
  let max = -Infinity;
  let median: StanceKey = "balanced";
  let tieFromMax = true;
  for (const k of STANCE_KEYS) {
    const w = composition.stanceWeights[k] ?? 0;
    if (w > max) {
      max = w;
      median = k;
      tieFromMax = false;
    } else if (w === max) {
      tieFromMax = true;
    }
  }
  const allFour = STANCE_KEYS.every(
    (k) => (composition.stanceWeights[k] ?? 0) > 0,
  );
  const stanceLabel = tieFromMax
    ? "balanced stance mix"
    : allFour
      ? `median stance ${median}`
      : `${median}-only`;

  return { regionsCount, industriesCount, sizesCount, stanceLabel };
}

export function workspaceSubtitle(summary: CompositionSummary): string {
  const parts = [
    `${summary.regionsCount} region${summary.regionsCount === 1 ? "" : "s"}`,
    `${summary.industriesCount} industries`,
    `${summary.sizesCount} company size${summary.sizesCount === 1 ? "" : "s"}`,
    summary.stanceLabel,
  ];
  return `spread across ${parts.join(", ")}`;
}

/**
 * Sprint 7 — runtime estimate for a panel of N personas. Whole-minute
 * granularity only. Calibrated from observed throughput: ~3-4 min at
 * N=100 with Anthropic Haiku 4.5 + concurrency=4 + token-bucket pacing.
 * Linear fit: ~1.8-2.4s/persona + 15-25s synthesis/validation overhead.
 */
export function estimateRuntime(panelSize: number): string {
  const n = Math.max(1, Math.round(panelSize));
  const lowMin = Math.max(1, Math.floor((n * 1.8 + 15) / 60));
  const highMin = Math.max(lowMin + 1, Math.ceil((n * 2.4 + 25) / 60));
  return `~${lowMin}-${highMin} minutes`;
}
