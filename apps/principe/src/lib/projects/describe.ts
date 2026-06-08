// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  REGION_KEYS,
  SIZE_BANDS,
  STANCE_KEYS,
  type PanelComposition,
  type StanceKey,
} from "./composition";

/**
 * Display name for a project. Each user's per-user Default project carries a
 * uid-tail suffix in the DB ("Default project · ab12") to satisfy the
 * @@unique([firmId, name]) constraint when several users each have one — but a
 * user only ever sees their own, so the UI renders the clean canonical label
 * instead of leaking that id fragment.
 */
export function projectDisplayName(project: {
  isDefault: boolean;
  name: string;
}): string {
  return project.isDefault ? "Default project" : project.name;
}

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
 * Runtime estimate for a panel of N personas. Whole-minute granularity.
 * Recalibrated to observed throughput on an Anthropic Tier-2 key: the default
 * 100-persona panel now lands ~1 min, so the estimate reads ~1-2 min. Linear
 * fit: ~0.45-0.6s/persona + ~15-25s synthesis/validation overhead. Anchors:
 * 30→~1-2, 100→~1-2, 200→~1-3. (Slower API tiers run longer; the high bound
 * gives headroom.)
 */
export function estimateRuntime(panelSize: number): string {
  const n = Math.max(1, Math.round(panelSize));
  const lowMin = Math.max(1, Math.floor((n * 0.45 + 15) / 60));
  const highMin = Math.max(lowMin + 1, Math.ceil((n * 0.6 + 25) / 60));
  return `~${lowMin}-${highMin} minutes`;
}
