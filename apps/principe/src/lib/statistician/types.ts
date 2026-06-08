// Mirrors services/statistician/app/models.py. Keep these two in sync; if
// the Pydantic schema changes, regenerate (or hand-update) this file.

export type Verdict = "PASS" | "WARN" | "FAIL";

export interface PanelComposition {
  personaCount: number;
  regions: string[];
  industries?: string[];
}

export interface RegionDistribution {
  region: string;
  weight: number;
}

export interface IndustryDistribution {
  industry: string;
  weight: number;
}

export interface AgreementObservation {
  // Stratum is a free-form key, by convention "region:stance" so 7×4=28
  // strata at the canonical 100-persona panel.
  stratum: string;
  proCount: number;
  conCount: number;
  neutralCount: number;
  n: number;
}

export interface VerdictRequest {
  panelComposition: PanelComposition;
  hypothesisText: string;
  questionType: string;
  // Per-region persona counts for THE PANEL (sent by Sprint 5.5+ callers).
  regionDistribution?: RegionDistribution[];
  // Sprint 6 — per-request TARGET region distribution. Send when the
  // project's composition restricts to specific regions (e.g. US-only
  // project). Statistician falls back to its global default when
  // omitted. Same shape as regionDistribution; the server normalises.
  targetDistribution?: RegionDistribution[];
  // Sprint 6 — industry symmetry. Panel industry mix + target industry
  // intent. Same shape as the region pair; server normalises.
  industryDistribution?: IndustryDistribution[];
  targetIndustryDistribution?: IndustryDistribution[];
  // Sprint 7 — per-stratum observed verdict counts from the panel run.
  // When supplied, the Statistician fits a real Beta-Binomial likelihood
  // and the CI tightens with observed data. Callers send this AFTER the
  // panel completes (POST-panel validation).
  agreementObservations?: AgreementObservation[];
}

export interface CredibleInterval {
  low: number;
  high: number;
}

export interface StratumRepresentation {
  stratum: string;
  observedCount: number;
  floor: number;
  meetsFloor: boolean;
}

export interface VerdictResponse {
  verdict: Verdict;
  credibleInterval: CredibleInterval;
  klDivergence: number;
  perStratumRepresentation: StratumRepresentation[];
  recommendedN: number;
  reasoningTrace: string;
  // Sprint 2 returns true; flips to false when Sprint 3 lands real Bayesian
  // inference. UI uses this to render a visible "stub mode" banner.
  stub: boolean;
}
