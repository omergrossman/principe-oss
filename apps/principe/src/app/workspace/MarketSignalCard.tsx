// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

/**
 * TrendContext shape — mirrors the server-side type in trend-analysis.ts.
 * Redeclared here so the client bundle never imports the server lib.
 */
export interface TrendContext {
  marketSaturation: "low" | "moderate" | "high";
  vcMomentum: "accelerating" | "stable" | "cooling";
  timingSignal: "early" | "peak" | "late";
  viabilityScore: number;
  narrative: string;
  dataSource: "corpus-only" | "corpus+updates";
  matchedCategories: string[];
}

type SignalColor = "pass" | "warn" | "fail";

function saturationColor(v: TrendContext["marketSaturation"]): SignalColor {
  return v === "low" ? "pass" : v === "moderate" ? "warn" : "fail";
}
function momentumColor(v: TrendContext["vcMomentum"]): SignalColor {
  return v === "accelerating" ? "pass" : v === "stable" ? "warn" : "fail";
}
function timingColor(v: TrendContext["timingSignal"]): SignalColor {
  return v === "peak" ? "pass" : v === "early" ? "warn" : "fail";
}

const COLOR_CLS: Record<SignalColor, string> = {
  pass: "text-verdict-pass",
  warn: "text-verdict-warn",
  fail: "text-verdict-fail",
};

// Dots scale: low=1, moderate/stable/early=2, high/accelerating/peak=3
const SAT_LEVEL: Record<TrendContext["marketSaturation"], 1 | 2 | 3> = {
  low: 1,
  moderate: 2,
  high: 3,
};
const MOM_LEVEL: Record<TrendContext["vcMomentum"], 1 | 2 | 3> = {
  cooling: 1,
  stable: 2,
  accelerating: 3,
};
const TIM_LEVEL: Record<TrendContext["timingSignal"], 1 | 2 | 3> = {
  early: 1,
  peak: 2,
  late: 3,
};

function Dots({ level, color }: { level: 1 | 2 | 3; color: SignalColor }) {
  return (
    <span className={`font-mono text-[13px] tracking-widest shrink-0 ${COLOR_CLS[color]}`}>
      {"●".repeat(level)}{"○".repeat(3 - level)}
    </span>
  );
}

function SignalRow({
  label,
  level,
  color,
  text,
}: {
  label: string;
  level: 1 | 2 | 3;
  color: SignalColor;
  text: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[12px] text-ink-500 w-[88px] shrink-0">{label}</span>
      <Dots level={level} color={color} />
      <span className="text-[13px] text-ink-700 capitalize">{text}</span>
    </div>
  );
}

/**
 * Market Signal card — rendered below the ValidationBanner when
 * trendContext is present on the ask result. Shows market saturation,
 * VC momentum, and timing signal, plus a composite viability score and
 * the analyst narrative.
 *
 * Matches ValidationBanner's structure: coloured border wrapper,
 * pill badge in the header, two-level prose, expandable source footer.
 */
export function MarketSignalCard({ ctx }: { ctx: TrendContext }) {
  const tempered =
    ctx.viabilityScore < 60 ||
    ctx.marketSaturation === "high" ||
    ctx.vcMomentum === "cooling";

  const scoreColor =
    ctx.viabilityScore >= 70
      ? "text-verdict-pass"
      : ctx.viabilityScore >= 50
        ? "text-verdict-warn"
        : "text-verdict-fail";

  const wrapperCls = tempered
    ? "bg-verdict-directional/10 border-verdict-directional/40"
    : "bg-verdict-pass/10 border-verdict-pass/40";

  const dataSourceLabel =
    ctx.dataSource === "corpus+updates" ? "corpus + live feed" : "corpus";

  return (
    <div className={`p-4 rounded-md border ${wrapperCls}`}>
      <div className="flex items-start gap-3">
        <span className="inline-flex items-center justify-center text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 bg-ink-700 text-white">
          Market
        </span>
        <div className="flex-1 min-w-0">
          {/* Header row: title + viability score */}
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <p className="text-[13px] font-semibold text-ink-900">
              Market Signal
            </p>
            <span className={`text-[13px] font-bold tabular-nums font-mono shrink-0 ${scoreColor}`}>
              Viability {ctx.viabilityScore}/100
            </span>
          </div>

          {/* Three signal rows */}
          <div className="space-y-1.5 mb-3">
            <SignalRow
              label="Saturation"
              level={SAT_LEVEL[ctx.marketSaturation]}
              color={saturationColor(ctx.marketSaturation)}
              text={ctx.marketSaturation}
            />
            <SignalRow
              label="VC Momentum"
              level={MOM_LEVEL[ctx.vcMomentum]}
              color={momentumColor(ctx.vcMomentum)}
              text={ctx.vcMomentum}
            />
            <SignalRow
              label="Timing"
              level={TIM_LEVEL[ctx.timingSignal]}
              color={timingColor(ctx.timingSignal)}
              text={ctx.timingSignal}
            />
          </div>

          {/* Analyst narrative */}
          <p className="text-[12px] text-ink-700 leading-relaxed">
            {ctx.narrative}
          </p>

          {/* Footer: source + category count */}
          <p className="text-[11px] text-ink-300 font-mono mt-2">
            Based on {dataSourceLabel}
            {ctx.matchedCategories.length > 0 &&
              ` · ${ctx.matchedCategories.length} calibration category match${ctx.matchedCategories.length !== 1 ? "es" : ""}`}
          </p>
        </div>
      </div>
    </div>
  );
}
