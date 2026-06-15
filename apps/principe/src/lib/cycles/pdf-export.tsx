// SPDX-License-Identifier: AGPL-3.0-or-later
// Executive PDF report for a Cycle. Renders via @react-pdf/renderer
// server-side to a Buffer. Layout favours information density — exec
// audiences scan, not read.

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
  Font,
} from "@react-pdf/renderer";
import type { PanelDecision } from "@/lib/ciso-panel/decision";

// react-pdf's Style type, derived from StyleSheet.create so we don't depend on
// the (non-hoisted) @react-pdf/types package.
type RichStyle = Parameters<typeof StyleSheet.create>[0][string];

// react-pdf doesn't ship system fonts. Use the embedded Helvetica
// (default) — adequate for executive reports; consistent across platforms.

const PALETTE = {
  ink900: "#11141a",
  ink700: "#39404a",
  ink500: "#6b7280",
  ink300: "#9ca3af",
  ink100: "#e5e7eb",
  pass: "#0f766e",
  warn: "#b45309",
  fail: "#b91c1c",
  flare: "#dc2626",
  canvas: "#fafafa",
  invalid: "#7f1d1d",
};

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#ffffff",
    padding: 40,
    fontSize: 10,
    color: PALETTE.ink700,
    fontFamily: "Helvetica",
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: PALETTE.ink900,
    paddingBottom: 12,
    marginBottom: 16,
  },
  pillRow: { flexDirection: "row", gap: 6, marginBottom: 6 },
  pill: {
    fontSize: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
    color: "#ffffff",
  },
  pillNeutral: {
    fontSize: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
    backgroundColor: PALETTE.ink100,
    color: PALETTE.ink700,
  },
  h1: { fontSize: 18, fontWeight: 700, color: PALETTE.ink900, marginBottom: 4 },
  meta: { fontSize: 9, color: PALETTE.ink500 },
  section: { marginTop: 14 },
  h2: {
    fontSize: 11,
    fontWeight: 700,
    color: PALETTE.ink900,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  body: { fontSize: 10, color: PALETTE.ink700, lineHeight: 1.4 },
  verdictGrid: {
    flexDirection: "row",
    gap: 16,
    marginTop: 4,
  },
  verdictItem: { flexDirection: "column" },
  verdictLabel: {
    fontSize: 7,
    color: PALETTE.ink300,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  verdictValue: { fontSize: 12, fontWeight: 700, color: PALETTE.ink900 },
  bullet: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 2,
  },
  bulletMark: { width: 8, color: PALETTE.ink500 },
  bulletText: { flex: 1, fontSize: 10, color: PALETTE.ink700, lineHeight: 1.4 },
  insightTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: PALETTE.ink900,
    marginTop: 6,
  },
  insightBody: { fontSize: 10, color: PALETTE.ink700, lineHeight: 1.4, marginTop: 2 },
  twoCol: { flexDirection: "row", gap: 16, marginTop: 4 },
  col: { flex: 1 },
  colHeader: {
    fontSize: 9,
    fontWeight: 700,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  regionalRow: {
    flexDirection: "row",
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: PALETTE.ink100,
  },
  regionalCell: { flex: 1, fontSize: 9 },
  regionalCellRight: { flex: 1, fontSize: 9, textAlign: "right" },
  regionRowVisual: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: PALETTE.ink100,
  },
  regionLabel: {
    width: 70,
    fontSize: 9,
    fontWeight: 700,
    color: PALETTE.ink700,
  },
  regionBarTrack: {
    flex: 1,
    height: 14,
    backgroundColor: PALETTE.ink100,
    borderRadius: 2,
    overflow: "hidden",
    flexDirection: "row",
  },
  regionBarSegment: { height: "100%" },
  regionCount: {
    width: 36,
    fontSize: 8,
    fontFamily: "Courier",
    color: PALETTE.ink500,
    textAlign: "right",
  },
  regionSentimentBox: {
    width: 48,
    height: 18,
    borderRadius: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  regionSentimentText: { fontSize: 9, fontWeight: 700, color: "#ffffff" },
  legend: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 6,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendSwatch: { width: 8, height: 8, borderRadius: 1 },
  legendText: { fontSize: 8, color: PALETTE.ink500 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 7,
    color: PALETTE.ink300,
    textAlign: "center",
    borderTopWidth: 0.5,
    borderTopColor: PALETTE.ink100,
    paddingTop: 6,
  },
  invalidBanner: {
    backgroundColor: PALETTE.invalid,
    color: "#ffffff",
    padding: 6,
    marginBottom: 12,
    fontSize: 10,
    fontWeight: 700,
    textAlign: "center",
  },
  hypothesisBox: {
    backgroundColor: PALETTE.canvas,
    padding: 8,
    marginTop: 4,
    fontFamily: "Courier",
    fontSize: 9,
    color: PALETTE.ink700,
    lineHeight: 1.4,
  },
  disclaimer: {
    marginTop: 20,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: PALETTE.ink100,
    fontSize: 8,
    color: PALETTE.ink500,
    lineHeight: 1.4,
  },
  disclaimerLabel: { fontWeight: 700, color: PALETTE.ink700 },
});

function verdictColour(verdict: string | null): string {
  if (verdict === "PASS") return PALETTE.pass;
  if (verdict === "WARN") return PALETTE.warn;
  if (verdict === "FAIL") return PALETTE.fail;
  return PALETTE.ink500;
}

function stanceColour(stance: string): string {
  if (stance === "Strong Yes" || stance === "Lean Yes") return PALETTE.pass;
  if (stance === "Split") return PALETTE.warn;
  if (stance === "Lean No" || stance === "Strong No") return PALETTE.fail;
  return PALETTE.ink500;
}

/**
 * Render `**bold**` spans inside a PDF Text. LLM output frequently contains
 * markdown bold even when asked not to; this shows it as actual bold rather
 * than literal asterisks. Plain strings pass through unchanged.
 */
function RichText({
  text,
  style,
}: {
  text: string;
  style?: RichStyle | RichStyle[];
}) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
          <Text key={i} style={{ fontWeight: 700 }}>
            {p.slice(2, -2)}
          </Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}

/**
 * Executive-level narrative for a validation verdict. Renders above the
 * metric grid so a reader who scans the PDF top-to-bottom sees the
 * headline interpretation before the raw KL/BCI/recommended-N numbers.
 */
function validationNarrative(verdict: string): string {
  switch (verdict) {
    case "PASS":
      return "Panel provides statistically representative coverage for this question — verdicts can be read as a directional statistical reading.";
    case "WARN":
      return "Panel coverage is workable but uneven for this question — verdicts are usable but the credible interval is wide; treat with caution.";
    case "FAIL":
      return "Panel is a poor statistical match for this question — treat verdicts as directional impressions, not as a statistical reading. Consider re-running with a panel composition adjusted to better match the question's relevant strata.";
    default:
      return "";
  }
}

function sentimentColour(mean: number): string {
  // 1-10 sentiment scale. Below ~4 reads negative, 4-7 neutral, 7+ positive.
  if (mean >= 7) return PALETTE.pass;
  if (mean >= 4) return PALETTE.warn;
  return PALETTE.fail;
}

function RegionalRow({
  row,
}: {
  row: {
    region: string;
    pro: number;
    con: number;
    neutral: number;
    total: number;
    sentimentMean: number | null;
  };
}) {
  const total = Math.max(1, row.total);
  const proPct = (row.pro / total) * 100;
  const conPct = (row.con / total) * 100;
  const neutralPct = (row.neutral / total) * 100;
  const sentimentBg =
    row.sentimentMean !== null ? sentimentColour(row.sentimentMean) : PALETTE.ink300;

  return (
    <View style={styles.regionRowVisual} wrap={false}>
      <Text style={styles.regionLabel}>{row.region}</Text>
      <View style={styles.regionBarTrack}>
        {row.pro > 0 && (
          <View
            style={[
              styles.regionBarSegment,
              { width: `${proPct}%`, backgroundColor: PALETTE.pass },
            ]}
          />
        )}
        {row.neutral > 0 && (
          <View
            style={[
              styles.regionBarSegment,
              { width: `${neutralPct}%`, backgroundColor: PALETTE.ink300 },
            ]}
          />
        )}
        {row.con > 0 && (
          <View
            style={[
              styles.regionBarSegment,
              { width: `${conPct}%`, backgroundColor: PALETTE.fail },
            ]}
          />
        )}
      </View>
      <Text style={styles.regionCount}>
        {row.pro}/{row.neutral}/{row.con}
      </Text>
      <View style={[styles.regionSentimentBox, { backgroundColor: sentimentBg }]}>
        <Text style={styles.regionSentimentText}>
          {row.sentimentMean !== null ? row.sentimentMean.toFixed(1) : "—"}
        </Text>
      </View>
    </View>
  );
}

function IndustryRow({
  row,
}: {
  row: { industry: string; pro: number; con: number; neutral: number; total: number };
}) {
  const total = row.total || 1;
  const proPct = (row.pro / total) * 100;
  const neutralPct = (row.neutral / total) * 100;
  const conPct = (row.con / total) * 100;
  return (
    <View style={styles.regionRowVisual} wrap={false}>
      <Text style={[styles.regionLabel, { width: 140 }]}>{row.industry}</Text>
      <View style={styles.regionBarTrack}>
        {row.pro > 0 && (
          <View
            style={[
              styles.regionBarSegment,
              { width: `${proPct}%`, backgroundColor: PALETTE.pass },
            ]}
          />
        )}
        {row.neutral > 0 && (
          <View
            style={[
              styles.regionBarSegment,
              { width: `${neutralPct}%`, backgroundColor: PALETTE.ink300 },
            ]}
          />
        )}
        {row.con > 0 && (
          <View
            style={[
              styles.regionBarSegment,
              { width: `${conPct}%`, backgroundColor: PALETTE.fail },
            ]}
          />
        )}
      </View>
      <Text style={styles.regionCount}>
        {row.pro}/{row.neutral}/{row.con}
      </Text>
    </View>
  );
}

export interface PdfCycleData {
  cycleId: string;
  panelVersion: string;
  projectName?: string | null;
  status: string;
  completedAt: Date | null;
  durationSec: number | null;
  llmCostUsd: string | null;
  hypothesis: string;
  isInvalid: boolean;
  verdict: {
    kind: string;
    confidenceScore: number;
    bciLow: number | null;
    bciHigh: number | null;
    // Sprint 5.5 — extended statistical fields surfaced from
    // HypothesisValidation (cycles) or ProjectAsk.validation (asks).
    klDivergence?: number | null;
    recommendedN?: number | null;
    reasoningTrace?: string | null;
  } | null;
  execSummary: {
    summary: string | null;
    topPros: string[];
    topCons: string[];
    insights: { title: string; reasoning: string }[];
    // Sprint 7 — "Strongest signals" themes section. Each theme has a
    // title + description + verdict mix; segments give attribute
    // breakdown (top regions/industries/stances) — never agent names.
    themes?: {
      title: string;
      description: string;
      verdictMix: { pro: number; con: number; neutral: number; total: number };
      segments?: { regions: string[]; industries: string[]; stances: string[] };
    }[];
    // Decision-grade output (BLUF). Optional — legacy asks / cycles won't carry it.
    decision?: PanelDecision | null;
  };
  // Sentiment + verdicts per region. `sentimentMean` is 0-10 (Claude's
  // own 1-10 sentiment scale from PanelResponse.sentiment), null when
  // no transcripts in that region. `total` = pro+con+neutral.
  regionalBreakdown: {
    region: string;
    pro: number;
    con: number;
    neutral: number;
    total: number;
    sentimentMean: number | null;
  }[];
  // Per-industry verdict split, sorted by coverage. Rendered compact (top N
  // + a "more" note) so the PDF stays short.
  industryBreakdown: {
    industry: string;
    pro: number;
    con: number;
    neutral: number;
    total: number;
  }[];
  // Headline panel sentiment metrics (matches the aggregates shape from
  // ciso-panel/ask.ts).
  sentiment: {
    mean: number;
    stdDev: number;
    spreadLabel: string;
  } | null;
  totals: { totalPersonas: number; transcriptCount: number };
}

/**
 * Title for the report. Executive framing — anchored to the project so
 * the reader sees what they're looking at before they read the question.
 * The full question lives in its own labelled section below.
 */
function deriveTitle(
  projectName: string | null | undefined,
  completedAt: Date | null,
): string {
  if (projectName && projectName.trim()) {
    return `Executive Report — ${projectName.trim()}`;
  }
  const date = (completedAt ?? new Date()).toISOString().slice(0, 10);
  return `Executive Report — ${date}`;
}

function CycleReport({ data }: { data: PdfCycleData }) {
  const verdictKind = data.verdict?.kind ?? "—";
  const verdictBg = verdictColour(verdictKind);
  const completedLabel = data.completedAt
    ? data.completedAt.toISOString().slice(0, 10)
    : "—";
  const title = deriveTitle(data.projectName, data.completedAt);
  const decision = data.execSummary.decision;

  return (
    <Document title={title}>
      <Page size="A4" style={styles.page} wrap>
        {data.isInvalid && (
          <View style={styles.invalidBanner}>
            <Text>STATISTICALLY INVALID — verdict force-overridden</Text>
          </View>
        )}

        <View style={styles.header}>
          <View style={styles.pillRow}>
            <Text style={[styles.pill, { backgroundColor: verdictBg }]}>
              {verdictKind}
            </Text>
            <Text style={styles.pillNeutral}>
              {data.totals.transcriptCount} of {data.totals.totalPersonas} responses
            </Text>
            {data.projectName && (
              <Text style={styles.pillNeutral}>{data.projectName}</Text>
            )}
          </View>
          <Text style={styles.h1}>
            {data.isInvalid && "[invalid] "}
            {title}
          </Text>
          <Text style={styles.meta}>
            {data.panelVersion} · {completedLabel}
            {data.durationSec !== null ? ` · ${data.durationSec}s runtime` : ""}
            {data.llmCostUsd ? ` · $${data.llmCostUsd} LLM spend` : ""}
            {" · "}cycle {data.cycleId.slice(-8)}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.h2}>Hypothesis</Text>
          <View style={styles.hypothesisBox}>
            <Text>{data.hypothesis}</Text>
          </View>
        </View>

        {decision && (
          <View style={styles.section}>
            <Text style={styles.h2}>Bottom line</Text>
            <View style={styles.verdictGrid}>
              <View style={styles.verdictItem}>
                <Text style={styles.verdictLabel}>Verdict</Text>
                <Text
                  style={[
                    styles.verdictValue,
                    { color: stanceColour(decision.recommendation.stance) },
                  ]}
                >
                  {decision.recommendation.stance}
                </Text>
              </View>
              <View style={styles.verdictItem}>
                <Text style={styles.verdictLabel}>In favour</Text>
                <Text style={styles.verdictValue}>
                  {decision.recommendation.favorPct}%
                </Text>
              </View>
              <View style={styles.verdictItem}>
                <Text style={styles.verdictLabel}>Confidence</Text>
                <Text style={styles.verdictValue}>
                  {decision.confidence.label}
                </Text>
              </View>
            </View>
            <RichText
              text={decision.recommendation.rationale}
              style={[styles.body, { marginTop: 4 }]}
            />
            <Text style={[styles.meta, { marginTop: 2 }]}>
              95% CI {decision.confidence.ci95[0]}–{decision.confidence.ci95[1]}%
              {" (±"}
              {decision.confidence.bandHalfWidthPp}pp · N={decision.confidence.n}
              {")"}
              {decision.confidence.failedCount > 0
                ? ` · ${decision.confidence.failedCount} failed (counted as not in favour)`
                : ""}
            </Text>
            {(() => {
              // Ranked objections (top 3 from the review pass / synthesiser),
              // falling back to the single legacy `objection` for old saved asks.
              const objs =
                decision.dissent.objections && decision.dissent.objections.length > 0
                  ? decision.dissent.objections
                  : decision.dissent.objection
                    ? [decision.dissent.objection]
                    : [];
              const { blindSpot, minorityStronger, opposedSegment } = decision.dissent;
              if (objs.length === 0 && !opposedSegment && !blindSpot) return null;
              return (
                <View style={{ marginTop: 6 }}>
                  <Text style={styles.verdictLabel}>What CISOs push back on</Text>
                  {objs.map((o, i) => (
                    <RichText key={i} text={`${i + 1}. ${o}`} style={styles.body} />
                  ))}
                  {opposedSegment && (
                    <Text style={styles.body}>
                      Most opposed: {opposedSegment.label} — {opposedSegment.conPct}% con (n=
                      {opposedSegment.n})
                    </Text>
                  )}
                  {blindSpot && (
                    <View style={{ marginTop: 5 }}>
                      <Text style={styles.verdictLabel}>What the panel almost missed</Text>
                      <RichText text={blindSpot} style={styles.body} />
                    </View>
                  )}
                  {minorityStronger && (
                    <Text style={[styles.body, { color: "#C97A1F", marginTop: 3 }]}>
                      Contested — on review, the dissenting case is the stronger one here.
                    </Text>
                  )}
                </View>
              );
            })()}
          </View>
        )}

        {data.verdict && (
          <View style={styles.section}>
            <Text style={styles.h2}>Statistical validation</Text>
            {validationNarrative(verdictKind) && (
              <Text style={[styles.body, { marginBottom: 6 }]}>
                {validationNarrative(verdictKind)}
              </Text>
            )}
            <View style={styles.verdictGrid}>
              <View style={styles.verdictItem}>
                <Text style={styles.verdictLabel}>Verdict</Text>
                <Text style={[styles.verdictValue, { color: verdictBg }]}>
                  {verdictKind}
                </Text>
              </View>
              <View style={styles.verdictItem}>
                <Text style={styles.verdictLabel}>Confidence</Text>
                <Text style={styles.verdictValue}>
                  {data.verdict.confidenceScore} / 100
                </Text>
              </View>
              {data.verdict.bciLow !== null && data.verdict.bciHigh !== null && (
                <View style={styles.verdictItem}>
                  <Text style={styles.verdictLabel}>BCI 95%</Text>
                  <Text style={styles.verdictValue}>
                    [{data.verdict.bciLow.toFixed(2)}, {data.verdict.bciHigh.toFixed(2)}]
                  </Text>
                </View>
              )}
              {typeof data.verdict.klDivergence === "number" && (
                <View style={styles.verdictItem}>
                  <Text style={styles.verdictLabel}>KL divergence</Text>
                  <Text style={styles.verdictValue}>
                    {data.verdict.klDivergence.toFixed(3)}
                  </Text>
                </View>
              )}
              {typeof data.verdict.recommendedN === "number" && (
                <View style={styles.verdictItem}>
                  <Text style={styles.verdictLabel}>Recommended N</Text>
                  <Text style={styles.verdictValue}>
                    {data.verdict.recommendedN}
                  </Text>
                </View>
              )}
            </View>
            {data.verdict.reasoningTrace && (
              <Text style={[styles.body, { marginTop: 6, fontStyle: "italic" }]}>
                {data.verdict.reasoningTrace}
              </Text>
            )}
          </View>
        )}

        {/* Sprint 7 — "Strongest signals" above the prose summary so a
            reader scanning the PDF sees the structural patterns first. */}
        {data.execSummary.themes && data.execSummary.themes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.h2}>Strongest signals</Text>
            {data.execSummary.themes.map((t, i) => {
              const dominant =
                t.verdictMix.pro >= t.verdictMix.con &&
                t.verdictMix.pro >= t.verdictMix.neutral
                  ? "pro"
                  : t.verdictMix.con >= t.verdictMix.neutral
                    ? "con"
                    : "neutral";
              const dominantColor =
                dominant === "pro"
                  ? PALETTE.pass
                  : dominant === "con"
                    ? PALETTE.fail
                    : PALETTE.ink500;
              const segmentLine = t.segments
                ? [...t.segments.regions, ...t.segments.industries, ...t.segments.stances]
                    .slice(0, 5)
                    .join(" · ")
                : "";
              return (
                <View key={i} wrap={false} style={{ marginTop: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                    <Text style={[styles.insightTitle, { marginTop: 0 }]}>
                      {t.title}
                    </Text>
                    <Text
                      style={{
                        fontSize: 8,
                        color: dominantColor,
                        textTransform: "uppercase",
                        fontWeight: 700,
                      }}
                    >
                      {dominant} {t.verdictMix.total}
                    </Text>
                  </View>
                  <RichText text={t.description} style={styles.insightBody} />
                  <Text
                    style={{
                      fontSize: 8,
                      color: PALETTE.ink300,
                      fontFamily: "Courier",
                      marginTop: 2,
                    }}
                  >
                    {segmentLine ||
                      `${t.verdictMix.pro} pro · ${t.verdictMix.neutral} neutral · ${t.verdictMix.con} con`}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {data.execSummary.summary && (
          <View style={styles.section}>
            <Text style={styles.h2}>Summary</Text>
            <RichText
              text={`${data.isInvalid ? "[invalid] " : ""}${data.execSummary.summary}`}
              style={styles.body}
            />
          </View>
        )}

        {(data.execSummary.topPros.length > 0 ||
          data.execSummary.topCons.length > 0) && (
          <View style={styles.section}>
            <View style={styles.twoCol}>
              {data.execSummary.topPros.length > 0 && (
                <View style={styles.col}>
                  <Text style={[styles.colHeader, { color: PALETTE.pass }]}>
                    Top pros
                  </Text>
                  {data.execSummary.topPros.map((p, i) => (
                    <View key={i} style={styles.bullet}>
                      <Text style={styles.bulletMark}>•</Text>
                      <RichText text={p} style={styles.bulletText} />
                    </View>
                  ))}
                </View>
              )}
              {data.execSummary.topCons.length > 0 && (
                <View style={styles.col}>
                  <Text style={[styles.colHeader, { color: PALETTE.fail }]}>
                    Top cons
                  </Text>
                  {data.execSummary.topCons.map((c, i) => (
                    <View key={i} style={styles.bullet}>
                      <Text style={styles.bulletMark}>•</Text>
                      <RichText text={c} style={styles.bulletText} />
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        {data.execSummary.insights.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.h2}>Insights</Text>
            {data.execSummary.insights.map((ins, i) => (
              <View key={i} wrap={false}>
                <Text style={styles.insightTitle}>{ins.title}</Text>
                <RichText text={ins.reasoning} style={styles.insightBody} />
              </View>
            ))}
          </View>
        )}

        {data.sentiment && (
          <View style={styles.section}>
            <Text style={styles.h2}>Overall sentiment</Text>
            <View style={styles.verdictGrid}>
              <View style={styles.verdictItem}>
                <Text style={styles.verdictLabel}>Mean (1–10)</Text>
                <Text
                  style={[
                    styles.verdictValue,
                    { color: sentimentColour(data.sentiment.mean) },
                  ]}
                >
                  {data.sentiment.mean.toFixed(1)}
                </Text>
              </View>
              <View style={styles.verdictItem}>
                <Text style={styles.verdictLabel}>Std dev (σ)</Text>
                <Text style={styles.verdictValue}>
                  {data.sentiment.stdDev.toFixed(2)}
                </Text>
              </View>
              <View style={styles.verdictItem}>
                <Text style={styles.verdictLabel}>Spread</Text>
                <Text style={styles.verdictValue}>{data.sentiment.spreadLabel}</Text>
              </View>
            </View>
          </View>
        )}

        {data.regionalBreakdown.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.h2}>Geographic distribution — verdict + sentiment</Text>
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: PALETTE.pass }]} />
                <Text style={styles.legendText}>Pro</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: PALETTE.ink300 }]} />
                <Text style={styles.legendText}>Neutral</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: PALETTE.fail }]} />
                <Text style={styles.legendText}>Con</Text>
              </View>
            </View>
            {data.regionalBreakdown.map((r) => (
              <RegionalRow key={r.region} row={r} />
            ))}
          </View>
        )}

        {data.industryBreakdown.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.h2}>Industry distribution — verdict split</Text>
            {data.industryBreakdown.slice(0, 8).map((r) => (
              <IndustryRow key={r.industry} row={r} />
            ))}
            {data.industryBreakdown.length > 8 && (
              <Text style={[styles.meta, { marginTop: 4 }]}>
                + {data.industryBreakdown.length - 8}{" "}
                {data.industryBreakdown.length - 8 === 1 ? "industry" : "industries"} more (
                {data.industryBreakdown
                  .slice(8)
                  .reduce((s, r) => s + r.total, 0)}{" "}
                responses)
              </Text>
            )}
          </View>
        )}

        <View style={styles.disclaimer} wrap={false}>
          <Text>
            <Text style={styles.disclaimerLabel}>Disclaimer. </Text>
            This report summarises responses from Príncipe&apos;s synthetic,
            AI-generated CISO panel — not real people, customers, or
            professional advisers. Every response is a model-generated
            simulation, provided for exploration and decision support only. It
            is not professional, legal, security, or financial advice and must
            not be relied upon as a substitute for real research or qualified
            professionals. Treat it as one input among many; you remain
            responsible for your decisions and their outcomes.
          </Text>
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Principe · ${data.projectName ?? "Panel report"} · ${data.cycleId.slice(-8)} · Generated ${new Date().toISOString().slice(0, 10)} · Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}

export async function renderCycleReport(data: PdfCycleData): Promise<Buffer> {
  return renderToBuffer(<CycleReport data={data} />);
}
