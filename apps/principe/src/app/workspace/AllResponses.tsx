// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";

export type Verdict = "pro" | "con" | "neutral";

export type Stance = "cautious" | "balanced" | "aggressive" | "contrarian";

export interface PanelResponseRow {
  index: number;
  agentKey: string;
  name: string;
  region: string;
  industry: string;
  companySize: string;
  tenure: string;
  stance: Stance;
  verdict: Verdict;
  sentiment: number;
  headline: string;
  reasoning: string;
  parseError: boolean;
  apiError: string | null;
}

export function AllResponses({ responses }: { responses: PanelResponseRow[] }) {
  const [region, setRegion] = useState<string>("all");
  const [industry, setIndustry] = useState<string>("all");
  const [stance, setStance] = useState<string>("all");
  const [verdict, setVerdict] = useState<string>("all");

  const regions = useMemo(
    () => Array.from(new Set(responses.map((r) => r.region))).sort(),
    [responses],
  );
  const industries = useMemo(
    () => Array.from(new Set(responses.map((r) => r.industry))).sort(),
    [responses],
  );
  const stances = useMemo(
    () => Array.from(new Set(responses.map((r) => r.stance))).sort(),
    [responses],
  );

  const filtered = responses.filter((r) => {
    if (region !== "all" && r.region !== region) return false;
    if (industry !== "all" && r.industry !== industry) return false;
    if (stance !== "all" && r.stance !== stance) return false;
    if (verdict !== "all" && r.verdict !== verdict) return false;
    return true;
  });

  return (
    <Card>
      <div className="space-y-3 mb-4">
        <FilterRow label="region" current={region} onSet={setRegion} options={regions} />
        <FilterRow label="industry" current={industry} onSet={setIndustry} options={industries} />
        <FilterRow label="stance" current={stance} onSet={setStance} options={stances} />
        <FilterRow
          label="verdict"
          current={verdict}
          onSet={setVerdict}
          options={["pro", "neutral", "con"]}
        />
        <p className="text-[12px] text-ink-300 font-mono">
          showing {filtered.length} / {responses.length}
        </p>
      </div>
      <div className="space-y-3">
        {filtered.map((r) => (
          <ResponseCard key={r.index} response={r} />
        ))}
      </div>
    </Card>
  );
}

function FilterRow({
  label,
  current,
  onSet,
  options,
}: {
  label: string;
  current: string;
  onSet: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] uppercase tracking-wide font-medium text-ink-500 w-16">
        {label}
      </span>
      <FilterChip label="all" current={current} onClick={onSet} />
      {options.map((o) => (
        <FilterChip key={o} label={o} current={current} onClick={onSet} />
      ))}
    </div>
  );
}

function FilterChip({
  label,
  current,
  onClick,
}: {
  label: string;
  current: string;
  onClick: (v: string) => void;
}) {
  const active = current === label;
  return (
    <button
      type="button"
      onClick={() => onClick(label)}
      className={`h-6 px-2 rounded-pill text-[11px] font-mono transition-colors border ${
        active
          ? "bg-ink-900 text-canvas border-ink-900"
          : "bg-elevated text-ink-700 border-ink-100 hover:border-ink-300"
      }`}
    >
      {label}
    </button>
  );
}

function ResponseCard({ response }: { response: PanelResponseRow }) {
  return (
    <div className="border border-ink-100 rounded-md p-3 bg-elevated">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h4 className="text-[14px] font-semibold text-ink-900">{response.name}</h4>
          <span className="text-[11px] text-ink-300 font-mono">
            {response.region} · {response.industry} · {response.companySize} · {response.tenure}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SentimentBadge sentiment={response.sentiment} />
          <VerdictBadge verdict={response.verdict} />
        </div>
      </div>
      {response.headline && (
        <p className="text-[13px] font-semibold text-ink-900 mt-1">
          {response.headline}
        </p>
      )}
      {response.reasoning && (
        <p className="text-[13px] text-ink-700 leading-relaxed mt-1 whitespace-pre-wrap">
          {response.reasoning}
        </p>
      )}
      {response.apiError && (
        <p className="text-[11px] text-verdict-fail font-mono mt-1">
          [api error] {response.apiError}
        </p>
      )}
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const cls = {
    pro: "bg-verdict-pass/15 text-verdict-pass border-verdict-pass/30",
    neutral:
      "bg-verdict-directional/15 text-verdict-directional border-verdict-directional/30",
    con: "bg-verdict-fail/15 text-verdict-fail border-verdict-fail/30",
  }[verdict];
  return (
    <span
      className={`inline-flex items-center h-5 px-2 rounded-pill text-[10px] font-mono uppercase tracking-wide border ${cls}`}
    >
      {verdict}
    </span>
  );
}

function SentimentBadge({ sentiment }: { sentiment: number }) {
  return (
    <span className="inline-flex items-center h-5 px-2 rounded-pill text-[10px] font-mono border bg-ink-100/30 text-ink-700 border-ink-100 tabular-nums">
      {sentiment} / 10
    </span>
  );
}
