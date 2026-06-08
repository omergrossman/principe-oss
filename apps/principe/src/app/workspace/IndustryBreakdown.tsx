// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { Card } from "@/components/ui/Card";
import type { PanelResponseRow } from "./AllResponses";

interface IndustryRow {
  industry: string;
  pro: number;
  neutral: number;
  con: number;
  total: number;
}

/**
 * Per-industry verdict split — one row per industry, with a horizontal
 * 100%-stacked bar (pro / neutral / con) and raw counts. Sorted by
 * sample size descending so the most-represented industries surface
 * first.
 */
export function IndustryBreakdown({
  responses,
}: {
  responses: PanelResponseRow[];
}) {
  const byIndustry = new Map<string, IndustryRow>();
  for (const r of responses) {
    if (r.apiError) continue;
    const row = byIndustry.get(r.industry) ?? {
      industry: r.industry,
      pro: 0,
      neutral: 0,
      con: 0,
      total: 0,
    };
    row[r.verdict] += 1;
    row.total += 1;
    byIndustry.set(r.industry, row);
  }
  const rows = Array.from(byIndustry.values()).sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.industry.localeCompare(b.industry);
  });

  return (
    <Card>
      <h3 className="text-[12px] uppercase tracking-wide font-semibold text-ink-500 mb-3">
        Verdict by industry
      </h3>
      <p className="text-[12px] text-ink-500 mb-4 leading-relaxed">
        Each row is 100% of that industry&apos;s respondents — bar shows
        the pro / neutral / con split. Sorted by sample size.
      </p>

      <div className="hidden sm:grid grid-cols-[140px_1fr_auto] gap-3 text-[11px] uppercase tracking-wide font-medium text-ink-300 pb-2 border-b border-ink-100">
        <span>Industry</span>
        <span>Split</span>
        <span className="text-right">n · counts</span>
      </div>

      <div className="space-y-2 mt-2">
        {rows.map((r) => (
          <Row key={r.industry} row={r} />
        ))}
      </div>
    </Card>
  );
}

function Row({ row }: { row: IndustryRow }) {
  const pctPro = (row.pro / row.total) * 100;
  const pctNeutral = (row.neutral / row.total) * 100;
  const pctCon = (row.con / row.total) * 100;
  return (
    <div className="grid grid-cols-[140px_1fr_auto] sm:grid-cols-[140px_1fr_auto] gap-3 items-center">
      <span
        className="text-[12px] text-ink-700 truncate font-medium"
        title={row.industry}
      >
        {row.industry}
      </span>
      <div className="flex h-2 rounded-pill overflow-hidden bg-ink-100/40">
        <Segment pct={pctPro} cls="bg-verdict-pass" label={`pro ${row.pro}`} />
        <Segment
          pct={pctNeutral}
          cls="bg-verdict-directional"
          label={`neutral ${row.neutral}`}
        />
        <Segment pct={pctCon} cls="bg-verdict-fail" label={`con ${row.con}`} />
      </div>
      <span className="text-[11px] font-mono text-ink-500 tabular-nums whitespace-nowrap">
        n={row.total} · {row.pro}/{row.neutral}/{row.con}
      </span>
    </div>
  );
}

function Segment({
  pct,
  cls,
  label,
}: {
  pct: number;
  cls: string;
  label: string;
}) {
  if (pct === 0) return null;
  return <div className={cls} style={{ width: `${pct}%` }} title={label} />;
}
