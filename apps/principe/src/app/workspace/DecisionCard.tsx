// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { Card } from "@/components/ui/Card";
import { MarkdownLite } from "./MarkdownLite";
import { type PanelDecision, type DecisionStance } from "@/lib/ciso-panel/decision";

const STANCE_TONE: Record<DecisionStance, { text: string; accent: string }> = {
  "Strong Yes": { text: "text-verdict-pass", accent: "border-l-verdict-pass" },
  "Lean Yes": { text: "text-verdict-pass", accent: "border-l-verdict-pass" },
  Split: { text: "text-verdict-warn", accent: "border-l-verdict-warn" },
  "Lean No": { text: "text-verdict-fail", accent: "border-l-verdict-fail" },
  "Strong No": { text: "text-verdict-fail", accent: "border-l-verdict-fail" },
};

const CONF_TONE: Record<PanelDecision["confidence"]["label"], string> = {
  High: "text-verdict-pass",
  Moderate: "text-verdict-warn",
  Low: "text-verdict-fail",
};

export function DecisionCard({ decision }: { decision?: PanelDecision }) {
  // Older saved asks (pre-decision-grade-output) won't carry this — render nothing.
  if (!decision) return null;
  const { recommendation: rec, confidence: conf, dissent } = decision;
  // Fall back to a neutral tone for legacy/unknown stance strings (e.g. asks
  // saved before the BLUF rename carried "Buy"/"Lean Buy") so the card never
  // crashes on old data.
  const tone = STANCE_TONE[rec.stance] ?? {
    text: "text-ink-900",
    accent: "border-l-ink-300",
  };
  // Legacy asks (pre-rename) stored `buyPct`; new ones store `favorPct`.
  const favorPct = rec.favorPct ?? (rec as { buyPct?: number }).buyPct ?? 0;

  return (
    <Card className={`border-l-4 ${tone.accent}`}>
      <p className="text-[11px] text-ink-300 uppercase tracking-wide font-semibold mb-2">
        Bottom line
      </p>
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className={`text-[24px] font-bold ${tone.text}`}>{rec.stance}</span>
        <span className="text-[20px] font-semibold text-ink-900 tabular-nums">
          {favorPct}% in favor
        </span>
      </div>

      <p className="text-[14px] text-ink-700 mt-2 leading-relaxed">
        <MarkdownLite text={rec.rationale} />
      </p>

      <div className="mt-4 flex items-center gap-2 flex-wrap text-[13px]">
        <span className="text-ink-500">Confidence:</span>
        <span className={`font-semibold ${CONF_TONE[conf.label]}`}>{conf.label}</span>
        <span className="text-ink-500 font-mono">
          95% CI {conf.ci95[0]}–{conf.ci95[1]}% (±{conf.bandHalfWidthPp}pp · N={conf.n})
        </span>
      </div>

      {conf.failedCount > 0 && (
        <p className="text-[12px] text-ink-300 mt-1">
          {conf.failedCount} response{conf.failedCount === 1 ? "" : "s"} failed — counted as non-buyers.
        </p>
      )}

      <div className="mt-4 pt-3 border-t border-ink-100">
        <p className="text-[11px] text-ink-300 uppercase tracking-wide font-medium mb-1">
          Where it splits
        </p>
        {dissent.objection ? (
          <p className="text-[13px] text-ink-700">
            <span className="font-semibold">Biggest objection:</span>{" "}
            <MarkdownLite text={dissent.objection} />
          </p>
        ) : (
          <p className="text-[13px] text-ink-500">No single buy-blocking objection stood out.</p>
        )}
        {dissent.opposedSegment ? (
          <p className="text-[13px] text-ink-700 mt-1">
            <span className="font-semibold">Most opposed:</span> {dissent.opposedSegment.label} —{" "}
            {dissent.opposedSegment.conPct}% con (n={dissent.opposedSegment.n})
          </p>
        ) : (
          <p className="text-[13px] text-ink-500 mt-1">
            No material dissent — the panel is broadly aligned.
          </p>
        )}
      </div>
    </Card>
  );
}
