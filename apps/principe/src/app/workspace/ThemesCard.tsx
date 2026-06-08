"use client";

import { Card } from "@/components/ui/Card";
import { MarkdownLite } from "./MarkdownLite";

export interface Theme {
  title: string;
  description: string;
  supportingAgents: string[];
  verdictMix: { pro: number; con: number; neutral: number; total: number };
  // Sprint 7 — attribute breakdown rendered instead of agent names.
  segments?: { regions: string[]; industries: string[]; stances: string[] };
}

/**
 * Sprint 7 T4 — "Strongest signals" section: themes clustered from the
 * 100 agent reasonings. LLM provides title + description + supporting
 * agent names; the per-theme verdict mix is computed server-side from
 * the actual responses. Surfaced above the executive summary so a reader
 * scanning the page sees structured patterns before the prose.
 *
 * Silent when no themes were produced (synthesis fallback or LLM failure).
 */
export function ThemesCard({ themes }: { themes: Theme[] }) {
  if (!themes || themes.length === 0) return null;

  return (
    <Card>
      <h3 className="text-[12px] uppercase tracking-wide font-semibold text-ink-500 mb-3">
        Strongest signals
      </h3>
      <div className="space-y-3">
        {themes.map((t, i) => (
          <ThemeRow key={i} theme={t} />
        ))}
      </div>
    </Card>
  );
}

function ThemeRow({ theme }: { theme: Theme }) {
  const { pro, con, neutral, total } = theme.verdictMix;
  const proPct = total > 0 ? (pro / total) * 100 : 0;
  const conPct = total > 0 ? (con / total) * 100 : 0;
  const neutralPct = total > 0 ? (neutral / total) * 100 : 0;

  // The dominant verdict colors the title pill.
  const dominant =
    pro >= con && pro >= neutral
      ? "pro"
      : con >= neutral
        ? "con"
        : "neutral";

  return (
    <div className="border-l-2 border-ink-100 pl-3">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-ink-900">
            <MarkdownLite text={theme.title} />
          </p>
          <p className="text-[12px] text-ink-700 leading-relaxed mt-0.5">
            <MarkdownLite text={theme.description} />
          </p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded ${
            dominant === "pro"
              ? "bg-verdict-pass/15 text-verdict-pass border border-verdict-pass/30"
              : dominant === "con"
                ? "bg-verdict-fail/15 text-verdict-fail border border-verdict-fail/30"
                : "bg-ink-100 text-ink-500 border border-ink-100"
          }`}
          title={`${pro} pro · ${con} con · ${neutral} neutral`}
        >
          {dominant} {total}
        </span>
      </div>
      {/* 100%-stacked verdict bar */}
      <div className="flex h-1 rounded-pill overflow-hidden bg-ink-100/40 mt-1.5">
        {pro > 0 && (
          <div
            className="bg-verdict-pass"
            style={{ width: `${proPct}%` }}
            title={`pro ${pro}`}
          />
        )}
        {neutral > 0 && (
          <div
            className="bg-ink-300"
            style={{ width: `${neutralPct}%` }}
            title={`neutral ${neutral}`}
          />
        )}
        {con > 0 && (
          <div
            className="bg-verdict-fail"
            style={{ width: `${conPct}%` }}
            title={`con ${con}`}
          />
        )}
      </div>
      {theme.segments && (
        <p className="text-[10px] text-ink-300 font-mono mt-1.5 truncate">
          {[
            ...theme.segments.regions,
            ...theme.segments.industries,
            ...theme.segments.stances,
          ]
            .slice(0, 5)
            .join(" · ") || `${theme.verdictMix.total} agents`}
        </p>
      )}
    </div>
  );
}
