// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useState } from "react";

/**
 * Shape of the Sprint 5.5 hybrid statistical validation result. Stored
 * on `ProjectAsk.validation` as JSON; surfaced via the live AskForm,
 * the past-asks SavedAskDashboard, and the public Share view.
 *
 * `error` is present when the Statistician was unavailable. We swallow
 * the error visually — surfacing it would alarm users about validation
 * infra rather than answer quality.
 */
export interface AskValidation {
  verdict?: "PASS" | "WARN" | "FAIL";
  confidence?: number;
  klDivergence?: number;
  bciLow?: number;
  bciHigh?: number;
  recommendedN?: number;
  reasoningTrace?: string;
  stub?: boolean;
  ranAt?: string;
  error?: string;
}

/**
 * Validation surface. Always-visible from Sprint 6+:
 *   - PASS  → subtle green card with verdict + 1-line summary + expand
 *   - WARN  → yellow warning card (visible attention)
 *   - FAIL  → red strong-warning card (demand attention)
 *
 * Originally silent-on-PASS (Sprint 5.5), but the user wanted the
 * stats outcome visible on every Ask — same logic the exports use
 * since the executive-narrative change. Statistician outages (`error`)
 * stay silent to avoid alarming users about validation infra rather
 * than answer quality.
 */
export function ValidationBanner({
  validation,
}: {
  validation: AskValidation;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!validation.verdict) return null;
  if (validation.error) return null;

  const verdict = validation.verdict;
  const isPass = verdict === "PASS";
  const isFail = verdict === "FAIL";

  const headline = isPass
    ? "Panel statistically representative of the question"
    : isFail
      ? "Statistically weak panel for this question"
      : "Statistically thin sample for this question";

  const subhead = isPass
    ? "Verdicts can be read as a directional statistical reading from the configured population."
    : isFail
      ? "The panel composition is a poor match for this question — treat verdicts directionally, not as a statistical reading."
      : "The panel composition is workable but coverage is uneven. Verdicts are usable but the credible interval is wide.";

  const wrapperCls = isPass
    ? "bg-verdict-pass/10 border-verdict-pass/40"
    : isFail
      ? "bg-verdict-fail/10 border-verdict-fail/40"
      : "bg-verdict-directional/10 border-verdict-directional/40";

  const pillCls = isPass
    ? "bg-verdict-pass text-white"
    : isFail
      ? "bg-verdict-fail text-white"
      : "bg-verdict-directional text-white";

  return (
    <div className={`p-4 rounded-md border ${wrapperCls}`}>
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex items-center justify-center text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${pillCls}`}
        >
          {verdict}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-ink-900">{headline}</p>
          <p className="text-[12px] text-ink-700 leading-relaxed mt-0.5">
            {subhead}
          </p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] text-ink-500 hover:text-ink-700 font-mono mt-2 underline underline-offset-2"
          >
            {expanded ? "Hide details" : "View details"}
          </button>
          {expanded && (
            <div className="mt-3 text-[12px] text-ink-700 leading-relaxed space-y-1 font-mono">
              <p>verdict: {validation.verdict} · confidence: {validation.confidence}%</p>
              {typeof validation.klDivergence === "number" && (
                <p>KL divergence: {validation.klDivergence.toFixed(3)}</p>
              )}
              {typeof validation.bciLow === "number" &&
                typeof validation.bciHigh === "number" && (
                  <p>
                    95% credible interval:{" "}
                    [{validation.bciLow.toFixed(2)}, {validation.bciHigh.toFixed(2)}]
                  </p>
                )}
              {typeof validation.recommendedN === "number" && (
                <p>recommended panel size for tight CI: {validation.recommendedN}</p>
              )}
              {validation.reasoningTrace && (
                <p className="whitespace-pre-wrap">{validation.reasoningTrace}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
