import {
  DEFAULT_COMPOSITION,
  type PanelComposition,
  SIZE_BANDS,
} from "./composition";

/**
 * Named panel presets surfaced in the wizard. The user picks one of
 * these (or "Custom") as the first step of project creation.
 *
 * Compositions are designed so each preset's regional/industry/stance
 * skew is meaningfully distinct from the others, validating that
 * panel composition is a load-bearing strategic decision.
 */

export interface Preset {
  key: string;
  name: string;
  description: string;
  composition: PanelComposition;
}

export const PRESETS: Preset[] = [
  {
    key: "global-default",
    name: "Global default",
    description:
      "The Sprint-1 panel — 100 CISOs spread across 7 regions, all 24 industries, balanced stances. Best when your idea is region- and industry-agnostic.",
    composition: { ...DEFAULT_COMPOSITION, presetKey: "global-default" },
  },
  {
    key: "eu-banking",
    name: "EU Banking focus",
    description:
      "EU-W + EU-C + UK only; financial industries; cautious-leaning stance; mid-market and up. Built for fintech or banking-adjacent products targeting EU regulators.",
    composition: {
      regionWeights: { uk: 32, "eu-west": 38, "eu-central": 30 },
      industries: [
        "Banks",
        "Insurance",
        "Financial Services",
        "Fintech & Payments",
      ],
      stanceWeights: {
        cautious: 0.45,
        balanced: 0.35,
        aggressive: 0.1,
        contrarian: 0.1,
      },
      sizeMin: SIZE_BANDS[2],
      sizeMax: SIZE_BANDS[4],
      presetKey: "eu-banking",
    },
  },
  {
    key: "us-saas-gtm",
    name: "US SaaS go-to-market",
    description:
      "US only; B2B SaaS + Consumer Internet + Tech Hardware; all sizes; aggressive-leaning stance. Built for go-to-market validation in the US SaaS market.",
    composition: {
      regionWeights: { us: 100 },
      industries: [
        "B2B SaaS",
        "Consumer Internet & E-commerce",
        "Tech Hardware & Devices",
        "Semiconductors",
      ],
      stanceWeights: {
        cautious: 0.15,
        balanced: 0.3,
        aggressive: 0.45,
        contrarian: 0.1,
      },
      sizeMin: SIZE_BANDS[0],
      sizeMax: SIZE_BANDS[4],
      presetKey: "us-saas-gtm",
    },
  },
  {
    key: "regulator-stress",
    name: "Regulator stress test",
    description:
      "All regions; regulator-adjacent industries (Banking · Healthcare · Energy · Utilities · Government); cautious + contrarian skew. Built to surface compliance blockers and worst-case scenarios.",
    composition: {
      regionWeights: {
        us: 25,
        "eu-west": 22,
        uk: 15,
        "eu-central": 13,
        apac: 13,
        anz: 7,
        mea: 5,
      },
      industries: [
        "Banks",
        "Insurance",
        "Healthcare Providers",
        "Pharmaceuticals & Biotech",
        "Energy (Oil, Gas, Renewables)",
        "Utilities (Power & Water)",
        "Government, Public Sector & Education",
      ],
      stanceWeights: {
        cautious: 0.4,
        balanced: 0.15,
        aggressive: 0.1,
        contrarian: 0.35,
      },
      sizeMin: SIZE_BANDS[2],
      sizeMax: SIZE_BANDS[4],
      presetKey: "regulator-stress",
    },
  },
];

export function getPreset(key: string): Preset | undefined {
  return PRESETS.find((p) => p.key === key);
}
