// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import {
  AllResponses,
  type PanelResponseRow,
} from "./AllResponses";
import { RegionalGlobe } from "./RegionalGlobe";
import { IndustryBreakdown } from "./IndustryBreakdown";
import { ValidationBanner, type AskValidation } from "./ValidationBanner";
import { MarkdownLite } from "./MarkdownLite";
import { ThemesCard, type Theme } from "./ThemesCard";

interface PanelAggregates {
  proCount: number;
  conCount: number;
  neutralCount: number;
  proPct: number;
  conPct: number;
  neutralPct: number;
  sentimentMean: number;
  sentimentStdDev: number;
  spreadLabel: "tight consensus" | "moderate spread" | "wide spread";
  parseFailures: number;
  apiFailures: number;
}

interface Summary {
  summary: string;
  topPros: string[];
  topCons: string[];
  insights: { title: string; reasoning: string }[];
  themes?: Theme[];
}

/**
 * Stateless dashboard render for a saved ask. The live AskForm has its
 * own `ResultBody`; this is the same shape but reading from
 * pre-serialised data (ProjectAsk.panelResult + .aggregates + .summary)
 * so the history detail view can re-render exactly what the user saw
 * when the ask completed.
 */
export function SavedAskDashboard({
  question,
  responses,
  aggregates,
  summary,
  durationMs,
  tokensIn,
  tokensOut,
  costUsd,
  validation,
  questionActions,
}: {
  question: string;
  responses: PanelResponseRow[];
  aggregates: PanelAggregates;
  summary: Summary;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  // Sprint 5.5 — hybrid statistical validation stored on ProjectAsk.
  // Undefined for legacy asks (pre-5.5) or when the Statistician was
  // unavailable. ValidationBanner self-hides on PASS / undefined.
  validation?: AskValidation | null;
  // Sprint 6 — optional inline actions to render in the question card
  // (Re-ask / Edit & ask on the past-asks detail page).
  questionActions?: React.ReactNode;
}) {
  const [showAll, setShowAll] = useState(false);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-ink-300 uppercase tracking-wide font-medium mb-1">
              question
            </p>
            <p className="text-[14px] text-ink-900 leading-relaxed">{question}</p>
          </div>
          {questionActions && (
            <div className="shrink-0">{questionActions}</div>
          )}
        </div>
      </Card>

      {validation && <ValidationBanner validation={validation} />}

      <KpiRow aggregates={aggregates} />

      {/* Sprint 7 T4 — Strongest signals above the exec summary. */}
      <ThemesCard themes={summary.themes ?? []} />

      <Card>
        <h3 className="text-[12px] uppercase tracking-wide font-semibold text-ink-500 mb-2">
          Executive summary
        </h3>
        <p className="text-[15px] text-ink-900 leading-relaxed whitespace-pre-wrap">
          <MarkdownLite text={summary.summary} />
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProsConsCard tone="pro" items={summary.topPros} />
        <ProsConsCard tone="con" items={summary.topCons} />
      </div>

      <InsightsCard insights={summary.insights} />

      <RegionalGlobe responses={responses} />
      <IndustryBreakdown responses={responses} />

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-ink-300 font-mono">
        <span>panel ran {(durationMs / 1000).toFixed(1)}s</span>
        <span>
          {tokensIn.toLocaleString()} in · {tokensOut.toLocaleString()} out
        </span>
        <span>${costUsd.toFixed(4)}</span>
      </div>

      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        className="w-full text-left flex items-center justify-between gap-2 px-4 py-3 rounded-md border border-ink-100 bg-elevated hover:border-ink-300 transition-colors"
      >
        <span className="text-[14px] font-semibold text-ink-900">
          {showAll ? "Hide" : "View"} all {responses.length} responses
        </span>
        <span className="text-[12px] text-ink-300 font-mono">
          {showAll ? "▲" : "▼"}
        </span>
      </button>

      {showAll && <AllResponses responses={responses} />}
    </div>
  );
}

function KpiRow({ aggregates }: { aggregates: PanelAggregates }) {
  const sentiment = aggregates.sentimentMean;
  const tone = sentiment >= 6.5 ? "pass" : sentiment >= 5 ? "warn" : "fail";
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <VerdictKpi aggregates={aggregates} />
      <Card>
        <p className="text-[11px] uppercase tracking-wide font-medium text-ink-500 mb-2">
          Sentiment
        </p>
        <p
          className={`text-[40px] font-bold leading-none tabular-nums ${
            tone === "pass"
              ? "text-verdict-pass"
              : tone === "fail"
                ? "text-verdict-fail"
                : "text-verdict-warn"
          }`}
        >
          {sentiment.toFixed(1)}
          <span className="text-[18px] text-ink-300 font-mono ml-1">/ 10</span>
        </p>
        <p className="text-[12px] text-ink-500 mt-2">
          {sentimentLabel(sentiment)}
        </p>
      </Card>
      <Card>
        <p className="text-[11px] uppercase tracking-wide font-medium text-ink-500 mb-2">
          Consensus
        </p>
        <p className="text-[40px] font-bold text-ink-900 leading-none tabular-nums">
          σ {aggregates.sentimentStdDev.toFixed(1)}
        </p>
        <p className="text-[12px] text-ink-500 mt-2 capitalize">
          {aggregates.spreadLabel}
        </p>
      </Card>
    </div>
  );
}

function VerdictKpi({ aggregates }: { aggregates: PanelAggregates }) {
  return (
    <Card>
      <p className="text-[11px] uppercase tracking-wide font-medium text-ink-500 mb-2">
        Verdict
      </p>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-[40px] font-bold text-ink-900 leading-none tabular-nums">
          {aggregates.proPct}%
        </span>
        <span className="text-[14px] text-ink-500">pro</span>
      </div>
      <div className="flex h-1.5 rounded-pill overflow-hidden bg-ink-100/60">
        <div className="bg-verdict-pass" style={{ width: `${aggregates.proPct}%` }} />
        <div
          className="bg-verdict-directional"
          style={{ width: `${aggregates.neutralPct}%` }}
        />
        <div className="bg-verdict-fail" style={{ width: `${aggregates.conPct}%` }} />
      </div>
      <div className="flex gap-3 mt-2 text-[11px] font-mono text-ink-500">
        <span>pro {aggregates.proCount}</span>
        <span>neutral {aggregates.neutralCount}</span>
        <span>con {aggregates.conCount}</span>
      </div>
    </Card>
  );
}

function ProsConsCard({
  tone,
  items,
}: {
  tone: "pro" | "con";
  items: string[];
}) {
  return (
    <Card>
      <h3
        className={`text-[12px] uppercase tracking-wide font-semibold mb-3 ${
          tone === "pro" ? "text-verdict-pass" : "text-verdict-fail"
        }`}
      >
        Top {tone === "pro" ? "pros" : "cons"}
      </h3>
      {items.length === 0 ? (
        <p className="text-[13px] text-ink-300 italic">
          Synthesis produced no ranked items.
        </p>
      ) : (
        <ol className="space-y-2">
          {items.map((it, i) => (
            <li
              key={i}
              className="flex gap-3 text-[14px] text-ink-700 leading-relaxed"
            >
              <span className="text-ink-300 font-mono tabular-nums shrink-0">
                {i + 1}.
              </span>
              <span>
                <MarkdownLite text={it} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function InsightsCard({
  insights,
}: {
  insights: { title: string; reasoning: string }[];
}) {
  return (
    <Card>
      <h3 className="text-[12px] uppercase tracking-wide font-semibold text-ink-500 mb-3">
        Key insights
      </h3>
      {insights.length === 0 ? (
        <p className="text-[13px] text-ink-300 italic">
          Synthesis produced no insights.
        </p>
      ) : (
        <div className="space-y-4">
          {insights.map((it, i) => (
            <div key={i} className="border-l-2 border-flare-600 pl-4">
              <p className="text-[14px] font-semibold text-ink-900 mb-1">
                <MarkdownLite text={it.title} />
              </p>
              <p className="text-[13px] text-ink-700 leading-relaxed">
                <MarkdownLite text={it.reasoning} />
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function sentimentLabel(n: number): string {
  if (n >= 8) return "strongly positive";
  if (n >= 6.5) return "positive";
  if (n >= 5) return "lukewarm";
  if (n >= 3.5) return "negative";
  return "strongly negative";
}
