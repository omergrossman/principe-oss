// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared types for the Principe vs Naive experiment harness.
// Only used by the experiment scripts — never imported by the Next.js app.

export type ConditionKey = "naive" | "personasOnly" | "principe";

export interface BenchmarkQuestion {
  q: string;
  type: string;  // PRIORITY | FORECAST | STRATEGY | FACTUAL | PITCH
  real: number;  // real CISO survey % in-favor
  src: string;   // survey source name
}

export interface QuestionResult {
  question: string;
  questionType: string;       // as classified/expected; "unrouted" for A & B
  realPct: number;            // ground truth from survey
  source: string;             // survey name
  panelPct: number;           // calibrated for C, raw for A & B
  rawPanelPct: number;        // always the uncorrected panel %
  sentimentMean: number;
  sentimentStdDev: number;
  sentimentHistogram: number[];  // indices 0–9 correspond to sentiment values 1–10
  byRegion: Record<string, { proPct: number; n: number }>;
  byIndustry: Record<string, { proPct: number; n: number }>;
  collapseFlag: boolean;      // true when winning verdict captures ≥ 85% of calls
  totalInputTokens: number;
  totalOutputTokens: number;
  durationMs: number;
  error?: string;             // set if the question failed entirely
}

export interface ConditionMetrics {
  mae: number;            // mean |panelPct − realPct| across valid questions (pp)
  diversityMean: number;  // mean sentimentStdDev across questions
  collapseRate: number;   // fraction of questions with collapseFlag (0–1)
  segmentSpread: number;  // mean(max−min regional proPct) across questions (pp)
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface ConditionResult {
  label: string;
  description: string;
  questions: QuestionResult[];
  metrics: ConditionMetrics;
}

export interface PersonaStance {
  stance: string;
  region: string;
}

export interface ExperimentRun {
  id: string;
  runDate: string;
  model: string;
  panelN: number;
  isDryRun: boolean;
  benchmarkCount: number;
  personaStances: PersonaStance[];  // used for the diversity grid (from default personas)
  conditions: {
    naive: ConditionResult;
    personasOnly: ConditionResult;
    principe: ConditionResult;
  };
}
