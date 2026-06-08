// SPDX-License-Identifier: AGPL-3.0-or-later
// Spreadsheet export for a Cycle — three tables in one CSV file.
//
// Imports cleanly into Excel / Sheets / Numbers; CSV uses RFC 4180
// quoting (double-quote, escape inner quotes by doubling). Newlines
// inside cells preserved by quoting.
//
// File structure (Sprint 7 redesign):
//   1) Cycle metadata table — column-header row + single data row with
//      cycle_id, panel_version, completed_at, hypothesis, validation.
//   2) Blank separator.
//   3) Sprint 7 — "Strongest signals" themes table: title, description,
//      dominant_verdict, pro/neutral/con/total counts, segment summary.
//      One row per theme. Skipped when no themes exist.
//   4) Blank separator.
//   5) Persona transcripts table — one row per persona response.
//
// Redacted fields (intentionally omitted): status, verdict_kind,
// confidence, parse_error, raw_text. Low-signal for the end consumer.
// Agent names removed from synthesized prose per Sprint 7 instruction.

interface CsvTranscript {
  personaName: string;
  personaRegion: string;
  industry: string | null;
  companySize: string | null;
  stance: string | null;
  verdict: string;
  sentiment: number;
  headline: string;
  reasoning: string;
}

interface CsvValidation {
  // Cycles can carry DIRECTIONAL (Sprint 2 extension to the Statistician
  // PASS/WARN/FAIL trio); asks only carry PASS/WARN/FAIL. Use `string` to
  // accept both without forcing the consumers into a discriminated union.
  verdict: string | null;
  confidence: number | null;
  klDivergence: number | null;
  bciLow: number | null;
  bciHigh: number | null;
  recommendedN: number | null;
  reasoningTrace: string | null;
}

interface CsvCycleMeta {
  cycleId: string;
  panelVersion: string;
  completedAt: Date | null;
  hypothesis: string;
  isInvalid: boolean;
  // Sprint 5.5 — surfaced from HypothesisValidation (cycles) or
  // ProjectAsk.validation (asks). Null on every field when the
  // Statistician was unavailable or the row predates Sprint 5.5.
  validation?: CsvValidation;
  // Sprint 7 — "Strongest signals" themes from synthesis. Each row in
  // the themes table is one cluster with verdict mix + segment summary.
  themes?: CsvTheme[];
}

export interface CsvTheme {
  title: string;
  description: string;
  pro: number;
  neutral: number;
  con: number;
  total: number;
  // Top regions/industries/stances "Nx LABEL" tokens for human reading.
  segments: string[];
}

const CYCLE_COLUMNS = [
  "cycle_id",
  "panel_version",
  "completed_at",
  "hypothesis",
  "statistically_invalid",
  // validation_summary is the executive-level plain-English read of the
  // verdict. Always populated when a verdict exists, so a reader scanning
  // the CSV in Excel sees the headline before the metrics columns.
  "validation_summary",
  "validation_verdict",
  "validation_confidence",
  "validation_kl_divergence",
  "validation_bci_low",
  "validation_bci_high",
  "validation_recommended_n",
  "validation_reasoning_trace",
] as const;

/**
 * Executive-level narrative for a validation verdict. Reader sees this
 * before the raw metrics; it explains what the verdict means in plain
 * language without forcing them to interpret KL divergence or BCI bounds.
 */
function validationSummary(verdict: string | null): string {
  switch (verdict) {
    case "PASS":
      return "Panel provides statistically representative coverage for this question — verdicts can be read as a directional statistical reading.";
    case "WARN":
      return "Panel coverage is workable but uneven for this question — verdicts are usable but the credible interval is wide; treat with caution.";
    case "FAIL":
      return "Panel is a poor statistical match for this question — treat verdicts as directional impressions, not as a statistical reading. Consider re-running with a panel composition adjusted to better match the question's relevant strata.";
    case "DIRECTIONAL":
      return "Verdicts are directional only — the statistical validation was force-overridden by the user.";
    default:
      return "";
  }
}

const PERSONA_COLUMNS = [
  "persona_name",
  "persona_region",
  "persona_industry",
  "persona_company_size",
  "persona_stance",
  "persona_verdict",
  "persona_sentiment",
  "persona_headline",
  "persona_reasoning",
] as const;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // RFC 4180: quote if contains comma, quote, or newline. Always quote
  // to keep cells obvious to consumers.
  return `"${s.replace(/"/g, '""')}"`;
}

export function buildCsv(
  cycle: CsvCycleMeta,
  transcripts: CsvTranscript[],
): string {
  const lines: string[] = [];

  // Disclaimer row (leading, then a blank separator). Príncipe's panel is a
  // simulation of synthetic AI personas; this travels with the exported data.
  lines.push(
    csvCell(
      "DISCLAIMER: Príncipe's CISOs are synthetic, AI-generated personas — not real people, customers, or professional advice. Output is for exploration only; treat it as one input among many and decide for yourself.",
    ),
  );
  lines.push("");

  const completedAt = cycle.completedAt
    ? cycle.completedAt.toISOString()
    : "";

  const v = cycle.validation;

  // Table 1 — cycle metadata. Column header row + single data row.
  lines.push(CYCLE_COLUMNS.map(csvCell).join(","));
  lines.push(
    [
      cycle.cycleId,
      cycle.panelVersion,
      completedAt,
      cycle.hypothesis,
      cycle.isInvalid ? "TRUE" : "FALSE",
      validationSummary(v?.verdict ?? null),
      v?.verdict ?? "",
      v?.confidence ?? "",
      v?.klDivergence ?? "",
      v?.bciLow ?? "",
      v?.bciHigh ?? "",
      v?.recommendedN ?? "",
      v?.reasoningTrace ?? "",
    ]
      .map(csvCell)
      .join(","),
  );

  // Blank separator after cycle metadata.
  lines.push("");

  // Sprint 7 — "Strongest signals" themes table (skipped if empty).
  if (cycle.themes && cycle.themes.length > 0) {
    const THEME_COLUMNS = [
      "theme_title",
      "theme_description",
      "dominant_verdict",
      "pro_count",
      "neutral_count",
      "con_count",
      "agent_count",
      "segments",
    ] as const;
    lines.push(THEME_COLUMNS.map(csvCell).join(","));
    for (const t of cycle.themes) {
      const dominant =
        t.pro >= t.con && t.pro >= t.neutral
          ? "pro"
          : t.con >= t.neutral
            ? "con"
            : "neutral";
      lines.push(
        [
          t.title,
          t.description,
          dominant,
          t.pro,
          t.neutral,
          t.con,
          t.total,
          t.segments.join(" · "),
        ]
          .map(csvCell)
          .join(","),
      );
    }
    lines.push("");
  }

  // Table — per-persona transcripts. Column header row + N data rows.
  lines.push(PERSONA_COLUMNS.map(csvCell).join(","));
  for (const t of transcripts) {
    lines.push(
      [
        t.personaName,
        t.personaRegion,
        t.industry ?? "",
        t.companySize ?? "",
        t.stance ?? "",
        t.verdict,
        t.sentiment,
        t.headline,
        t.reasoning,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  return lines.join("\n");
}
