// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Panel composition — the JSON shape stored on Project.composition.
 *
 * NULL on a project means "use the deterministic default" (Sprint 1's
 * 100 globally-distributed agents). Non-null = explicit user-authored
 * panel.
 *
 * All fields are normalized at write time: regions/industries arrays
 * are deduped + sorted; stance weights sum to 1.0; sizeRange min ≤ max
 * by SIZE_BANDS index.
 */

export const REGION_KEYS = [
  "us",
  "eu-west",
  "uk",
  "eu-central",
  "apac",
  "anz",
  "mea",
] as const;
export type RegionKey = (typeof REGION_KEYS)[number];

export const STANCE_KEYS = [
  "cautious",
  "balanced",
  "aggressive",
  "contrarian",
] as const;
export type StanceKey = (typeof STANCE_KEYS)[number];

export const SIZE_BANDS = [
  "150-400 (Series B)",
  "400-1k (Series C)",
  "1k-5k (Series D+/pre-IPO)",
  "5k-20k (mid-market)",
  "20k+ (enterprise)",
] as const;
export type SizeBand = (typeof SIZE_BANDS)[number];

export interface PanelComposition {
  // Region weights in agent count terms — sums to 100. Missing keys = 0.
  regionWeights: Partial<Record<RegionKey, number>>;
  // Industries to draw from. Empty = all 24.
  industries: string[];
  // Stance distribution — weights sum to 1.0.
  stanceWeights: Record<StanceKey, number>;
  // Size band range (inclusive).
  sizeMin: SizeBand;
  sizeMax: SizeBand;
  // Which preset (if any) produced this composition. Null = custom.
  presetKey: string | null;
}

/**
 * The Sprint-1 default — reproduces the global panel composition.
 * Region weights match what's in lib/personas/generate100.ts's REGIONS
 * constant exactly.
 */
export const DEFAULT_COMPOSITION: PanelComposition = {
  regionWeights: {
    us: 32,
    "eu-west": 18,
    uk: 12,
    "eu-central": 10,
    apac: 13,
    anz: 8,
    mea: 7,
  },
  industries: [],
  stanceWeights: {
    cautious: 0.25,
    balanced: 0.25,
    aggressive: 0.25,
    contrarian: 0.25,
  },
  sizeMin: SIZE_BANDS[0],
  sizeMax: SIZE_BANDS[4],
  presetKey: "global-default",
};

/**
 * Validate + normalise a composition for storage. Throws on
 * unrecoverable shape errors. Doesn't enforce that region weights sum
 * to 100 — that's done at materialisation time after rounding.
 */
export function normaliseComposition(
  input: Partial<PanelComposition>,
): PanelComposition {
  const regionWeights: Partial<Record<RegionKey, number>> = {};
  for (const [k, v] of Object.entries(input.regionWeights ?? {})) {
    if (REGION_KEYS.includes(k as RegionKey) && Number(v) > 0) {
      regionWeights[k as RegionKey] = Math.max(0, Math.round(Number(v)));
    }
  }
  // Renormalise to sum to 100.
  const sum = Object.values(regionWeights).reduce((a, b) => a + (b ?? 0), 0);
  if (sum === 0) {
    Object.assign(regionWeights, DEFAULT_COMPOSITION.regionWeights);
  } else if (sum !== 100) {
    const scale = 100 / sum;
    let running = 0;
    const entries = Object.entries(regionWeights) as Array<[RegionKey, number]>;
    for (let i = 0; i < entries.length - 1; i++) {
      const scaled = Math.round(entries[i][1] * scale);
      regionWeights[entries[i][0]] = scaled;
      running += scaled;
    }
    if (entries.length > 0) {
      regionWeights[entries[entries.length - 1][0]] = Math.max(
        0,
        100 - running,
      );
    }
  }

  const industries = Array.from(
    new Set((input.industries ?? []).filter((s) => typeof s === "string")),
  ).sort();

  const stanceWeights: Record<StanceKey, number> = { ...input.stanceWeights } as Record<StanceKey, number>;
  for (const k of STANCE_KEYS) {
    if (typeof stanceWeights[k] !== "number" || stanceWeights[k] < 0) {
      stanceWeights[k] = DEFAULT_COMPOSITION.stanceWeights[k];
    }
  }
  const sw =
    stanceWeights.cautious +
    stanceWeights.balanced +
    stanceWeights.aggressive +
    stanceWeights.contrarian;
  if (sw > 0 && Math.abs(sw - 1) > 0.001) {
    for (const k of STANCE_KEYS) stanceWeights[k] = stanceWeights[k] / sw;
  }

  const sizeMin =
    input.sizeMin && (SIZE_BANDS as readonly string[]).includes(input.sizeMin)
      ? (input.sizeMin as SizeBand)
      : DEFAULT_COMPOSITION.sizeMin;
  const sizeMax =
    input.sizeMax && (SIZE_BANDS as readonly string[]).includes(input.sizeMax)
      ? (input.sizeMax as SizeBand)
      : DEFAULT_COMPOSITION.sizeMax;
  const minIdx = SIZE_BANDS.indexOf(sizeMin);
  const maxIdx = SIZE_BANDS.indexOf(sizeMax);
  const finalMin = SIZE_BANDS[Math.min(minIdx, maxIdx)];
  const finalMax = SIZE_BANDS[Math.max(minIdx, maxIdx)];

  return {
    regionWeights,
    industries,
    stanceWeights,
    sizeMin: finalMin,
    sizeMax: finalMax,
    presetKey: input.presetKey ?? null,
  };
}
