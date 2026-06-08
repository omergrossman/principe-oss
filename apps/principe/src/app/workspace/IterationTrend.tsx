// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { Card } from "@/components/ui/Card";

export interface IterationSummary {
  question: string;
  sentimentMean: number;
  proPct: number;
  sentimentStdDev: number;
}

export function IterationTrend({ history }: { history: IterationSummary[] }) {
  const series = history.map((it, i) => ({
    iteration: i + 1,
    sentiment: it.sentimentMean,
    proPct: it.proPct,
    sigma: it.sentimentStdDev,
    sameQuestion: i === 0 || it.question === history[i - 1].question,
  }));

  const latest = series[series.length - 1];
  const first = series[0];
  const sentimentDelta = latest.sentiment - first.sentiment;
  const proDelta = latest.proPct - first.proPct;
  const sigmaDelta = latest.sigma - first.sigma;

  const meanOfMeans =
    series.reduce((a, b) => a + b.sentiment, 0) / series.length;
  const acrossSigma = Math.sqrt(
    series.reduce(
      (acc, s) => acc + (s.sentiment - meanOfMeans) * (s.sentiment - meanOfMeans),
      0,
    ) / series.length,
  );

  return (
    <Card>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-[12px] uppercase tracking-wide font-semibold text-ink-500">
          Iteration trend · {history.length} runs
        </h3>
        <span className="text-[11px] text-ink-300 font-mono">
          cross-run σ {acrossSigma.toFixed(2)} ·{" "}
          {acrossSigma < 0.4
            ? "stable panel view"
            : acrossSigma < 0.9
              ? "moderate variance"
              : "high variance"}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <TrendTile
          label="Sentiment"
          latest={latest.sentiment.toFixed(1)}
          unit=" / 10"
          delta={sentimentDelta}
          values={series.map((s) => s.sentiment)}
          domain={[1, 10]}
          accent="flare"
        />
        <TrendTile
          label="Pro %"
          latest={String(latest.proPct)}
          unit="%"
          delta={proDelta}
          values={series.map((s) => s.proPct)}
          domain={[0, 100]}
          accent="pass"
        />
        <TrendTile
          label="Spread σ"
          latest={latest.sigma.toFixed(1)}
          unit=""
          delta={sigmaDelta}
          values={series.map((s) => s.sigma)}
          domain={[0, 5]}
          accent="ink"
          deltaInverted
        />
      </div>
      <IterationStrip series={series} />
    </Card>
  );
}

function TrendTile({
  label,
  latest,
  unit,
  delta,
  values,
  domain,
  accent,
  deltaInverted = false,
}: {
  label: string;
  latest: string;
  unit: string;
  delta: number;
  values: number[];
  domain: [number, number];
  accent: "flare" | "pass" | "ink";
  deltaInverted?: boolean;
}) {
  const positiveDirection = deltaInverted ? delta < 0 : delta > 0;
  const isFlat = Math.abs(delta) < 0.05;
  const stroke =
    accent === "flare" ? "#E0671E" : accent === "pass" ? "#2E8B57" : "#1A2854";
  return (
    <div className="rounded-md border border-ink-100 bg-elevated p-3">
      <p className="text-[10px] uppercase tracking-wide font-medium text-ink-500 mb-1">
        {label}
      </p>
      <div className="flex items-baseline justify-between">
        <p className="text-[26px] font-bold text-ink-900 leading-none tabular-nums">
          {latest}
          <span className="text-[14px] text-ink-300 font-mono">{unit}</span>
        </p>
        <DeltaPill delta={delta} isFlat={isFlat} good={positiveDirection} />
      </div>
      <div className="mt-3">
        <Sparkline values={values} domain={domain} stroke={stroke} />
      </div>
    </div>
  );
}

function DeltaPill({
  delta,
  isFlat,
  good,
}: {
  delta: number;
  isFlat: boolean;
  good: boolean;
}) {
  if (isFlat) {
    return <span className="text-[11px] font-mono text-ink-300">±0.0</span>;
  }
  const sign = delta > 0 ? "+" : "";
  const cls = good ? "text-verdict-pass" : "text-verdict-fail";
  return (
    <span className={`text-[11px] font-mono ${cls}`}>
      {sign}
      {delta.toFixed(1)}
    </span>
  );
}

function Sparkline({
  values,
  domain,
  stroke,
}: {
  values: number[];
  domain: [number, number];
  stroke: string;
}) {
  const W = 120;
  const H = 28;
  const [lo, hi] = domain;
  const span = hi - lo || 1;
  if (values.length === 0) return null;
  if (values.length === 1) {
    const cy = H - ((values[0] - lo) / span) * H;
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
        <circle cx={W / 2} cy={cy} r="2" fill={stroke} />
      </svg>
    );
  }
  const xs = values.map((_, i) => (i / (values.length - 1)) * W);
  const ys = values.map((v) => H - ((v - lo) / span) * H);
  const d = xs
    .map((x, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${ys[i].toFixed(2)}`)
    .join(" ");
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      className="block"
      preserveAspectRatio="none"
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r="1.6" fill={stroke} />
      ))}
    </svg>
  );
}

function IterationStrip({
  series,
}: {
  series: Array<{
    iteration: number;
    sentiment: number;
    proPct: number;
    sigma: number;
    sameQuestion: boolean;
  }>;
}) {
  return (
    <div className="mt-4 pt-3 border-t border-ink-100 grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-x-3 gap-y-1 text-[11px] font-mono">
      <span className="text-ink-300">#</span>
      <span className="text-ink-300">sentiment</span>
      <span className="text-ink-300">pro%</span>
      <span className="text-ink-300">σ</span>
      <span className="text-ink-300">q</span>
      {series.map((s) => (
        <div key={s.iteration} className="contents">
          <span className="text-ink-700 tabular-nums">{s.iteration}</span>
          <span className="text-ink-700 tabular-nums">{s.sentiment.toFixed(1)}</span>
          <span className="text-ink-700 tabular-nums">{s.proPct}%</span>
          <span className="text-ink-700 tabular-nums">{s.sigma.toFixed(1)}</span>
          <span
            className={
              s.sameQuestion ? "text-ink-300" : "text-flare-600 font-semibold"
            }
            title={s.sameQuestion ? "same question" : "question changed"}
          >
            {s.sameQuestion ? "·" : "✎"}
          </span>
        </div>
      ))}
    </div>
  );
}
