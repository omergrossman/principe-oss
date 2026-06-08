"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export type CycleStatusUi = "DRAFT" | "RUNNING" | "COMPLETE" | "FAILED";

interface CycleProps {
  cycle: {
    id: string;
    status: CycleStatusUi;
    totalPersonas: number;
    failedReason: string | null;
    hypothesisContent: string;
    isInvalid: boolean;
    initialTranscriptCount: number;
  };
  verdict: {
    kind: string;
    confidenceScore: number;
    bciLow: number | null;
    bciHigh: number | null;
    forceOverridden: boolean;
  } | null;
  execSummary: {
    summary: string | null;
    topPros: string[];
    topCons: string[];
    insights: { title: string; reasoning: string }[];
  };
  transcripts: Array<{
    id: string;
    personaName: string;
    personaRegion: string;
    paragraphs: string[];
    verdict: string;
    sentiment: number;
    headline: string;
    parseError: boolean;
    rawText: string | null;
  }>;
}

export function CycleResultClient({
  cycle,
  verdict,
  execSummary,
  transcripts,
}: CycleProps) {
  const [status, setStatus] = useState<CycleStatusUi>(cycle.status);
  const [transcriptCount, setTranscriptCount] = useState(
    cycle.initialTranscriptCount,
  );
  const [failedReason, setFailedReason] = useState(cycle.failedReason);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shouldPoll = status === "RUNNING";

  useEffect(() => {
    if (!shouldPoll) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/cycles/${cycle.id}/status`);
        if (!res.ok) return;
        const body = (await res.json()) as {
          status: CycleStatusUi;
          transcriptCount: number;
          failedReason: string | null;
        };
        setStatus(body.status);
        setTranscriptCount(body.transcriptCount);
        setFailedReason(body.failedReason);
        if (body.status !== "RUNNING") {
          // Stop polling; the next interaction or reload renders the final state.
          clearInterval(interval);
          // Reload to fetch the full COMPLETE/FAILED payload (transcripts, exec
          // summary). Avoids a duplicate data path through the polling endpoint.
          window.location.reload();
        }
      } catch {
        // Network blips don't tear down the poll.
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [shouldPoll, cycle.id]);

  async function handleStart() {
    setError(null);
    setStarting(true);
    try {
      const res = await fetch(`/api/cycles/${cycle.id}/run`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Run failed (HTTP ${res.status})`);
        setStarting(false);
        return;
      }
      setStatus("RUNNING");
      setStarting(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setStarting(false);
    }
  }

  if (status === "DRAFT") {
    return (
      <Card>
        <h2 className="text-[14px] font-semibold text-ink-900 mb-2">
          {cycle.isInvalid ? "[invalid] " : ""}Cycle ready to run
        </h2>
        <p className="text-[13px] text-ink-500 leading-relaxed mb-4">
          Validation passed{verdict?.forceOverridden ? " (force-overridden FAIL)" : ""}.
          Click Start run to dispatch the 100-agent panel. Output lands here
          when complete.
        </p>
        {error && (
          <p role="alert" className="text-[12px] text-verdict-fail bg-verdict-fail/10 px-3 py-2 rounded-md mb-3">
            {error}
          </p>
        )}
        <Button
          variant="primary"
          size="md"
          onClick={handleStart}
          disabled={starting}
        >
          {starting ? "Starting" : "Start run"}
        </Button>
      </Card>
    );
  }

  if (status === "RUNNING") {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-[14px] font-semibold text-ink-900">Running</h2>
          <span className="inline-block w-2 h-2 rounded-full bg-flare-600 animate-pulse" />
        </div>
        <p
          className="text-[13px] text-ink-700 leading-relaxed"
          role="status"
          aria-live="polite"
        >
          {transcriptCount} / {cycle.totalPersonas} personas responded.
        </p>
        <div className="h-2 bg-subtle rounded-pill mt-3 overflow-hidden">
          <div
            className="h-full bg-flare-600 transition-all"
            style={{
              width: `${Math.min(100, (transcriptCount / Math.max(1, cycle.totalPersonas)) * 100)}%`,
            }}
          />
        </div>
        <p className="text-[11px] text-ink-300 mt-3 font-mono">
          Polling every 3s. Page reloads automatically when the run completes.
        </p>
      </Card>
    );
  }

  if (status === "FAILED") {
    return (
      <div className="space-y-6">
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-[14px] font-semibold text-ink-900">Run failed</h2>
          </div>
          <p className="text-[13px] text-verdict-fail bg-verdict-fail/10 px-3 py-2 rounded-md mb-4">
            {failedReason ?? "Unknown failure"}
          </p>
          {transcripts.length > 0 && (
            <p className="text-[12px] text-ink-500 mb-4">
              {transcripts.length} of {cycle.totalPersonas} responses were
              persisted before failure — see below.
            </p>
          )}
          {error && (
            <p role="alert" className="text-[12px] text-verdict-fail bg-verdict-fail/10 px-3 py-2 rounded-md mb-3">
              {error}
            </p>
          )}
          <Button
            variant="secondary"
            size="md"
            onClick={handleStart}
            disabled={starting}
          >
            {starting ? "Retrying" : "Retry"}
          </Button>
        </Card>
        {transcripts.length > 0 && (
          <>
            <ExportBar cycleId={cycle.id} hasTranscripts={transcripts.length > 0} />
            <TranscriptList transcripts={transcripts} />
          </>
        )}
      </div>
    );
  }

  // COMPLETE
  return (
    <div className="space-y-6">
      <VerdictCard verdict={verdict} isInvalid={cycle.isInvalid} />
      <ExportBar cycleId={cycle.id} hasTranscripts={transcripts.length > 0} />
      <ExecSummary summary={execSummary} isInvalid={cycle.isInvalid} />
      <Breakdowns transcripts={transcripts} />
      <TranscriptList transcripts={transcripts} />
    </div>
  );
}

function VerdictCard({
  verdict,
  isInvalid,
}: {
  verdict: CycleProps["verdict"];
  isInvalid: boolean;
}) {
  if (!verdict) return null;
  return (
    <Card>
      <h2 className="text-[14px] font-semibold text-ink-900 mb-2">
        {isInvalid ? "[invalid] " : ""}Verdict
      </h2>
      <div className="space-y-1.5 font-mono text-[12px] text-ink-500">
        <Row label="Kind" value={verdict.kind} />
        <Row label="Confidence" value={`${verdict.confidenceScore}/100`} />
        {verdict.bciLow !== null && verdict.bciHigh !== null && (
          <Row
            label="BCI 95%"
            value={`[${verdict.bciLow.toFixed(2)}, ${verdict.bciHigh.toFixed(2)}]`}
          />
        )}
        {verdict.forceOverridden && (
          <Row label="Force-overridden" value="yes" />
        )}
      </div>
    </Card>
  );
}

function ExecSummary({
  summary,
  isInvalid,
}: {
  summary: CycleProps["execSummary"];
  isInvalid: boolean;
}) {
  if (
    !summary.summary &&
    summary.topPros.length === 0 &&
    summary.topCons.length === 0
  ) {
    return null;
  }
  return (
    <Card>
      <h2 className="text-[14px] font-semibold text-ink-900 mb-3">
        {isInvalid ? "[invalid] " : ""}Exec summary
      </h2>
      {summary.summary && (
        <p className="text-[13px] text-ink-700 leading-relaxed mb-4 whitespace-pre-wrap">
          {isInvalid && "[invalid] "}
          {summary.summary}
        </p>
      )}
      {(summary.topPros.length > 0 || summary.topCons.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {summary.topPros.length > 0 && (
            <div>
              <h3 className="text-[12px] font-semibold text-verdict-pass mb-1 font-mono uppercase">
                Top pros
              </h3>
              <ul className="text-[13px] text-ink-700 leading-relaxed list-disc pl-5 space-y-1">
                {summary.topPros.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {summary.topCons.length > 0 && (
            <div>
              <h3 className="text-[12px] font-semibold text-verdict-fail mb-1 font-mono uppercase">
                Top cons
              </h3>
              <ul className="text-[13px] text-ink-700 leading-relaxed list-disc pl-5 space-y-1">
                {summary.topCons.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {summary.insights.length > 0 && (
        <div>
          <h3 className="text-[12px] font-semibold text-ink-900 mb-2 font-mono uppercase">
            Insights
          </h3>
          <div className="space-y-3">
            {summary.insights.map((ins, i) => (
              <div key={i}>
                <p className="text-[13px] font-semibold text-ink-900">
                  {ins.title}
                </p>
                <p className="text-[12px] text-ink-700 leading-relaxed mt-0.5">
                  {ins.reasoning}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function Breakdowns({
  transcripts,
}: {
  transcripts: CycleProps["transcripts"];
}) {
  const byRegion = useMemo(() => {
    const m = new Map<string, { pro: number; con: number; neutral: number }>();
    for (const t of transcripts) {
      const k = t.personaRegion;
      const row = m.get(k) ?? { pro: 0, con: 0, neutral: 0 };
      const v = t.verdict === "pro" ? "pro" : t.verdict === "con" ? "con" : "neutral";
      row[v] += 1;
      m.set(k, row);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [transcripts]);

  if (byRegion.length === 0) return null;

  return (
    <Card>
      <h2 className="text-[14px] font-semibold text-ink-900 mb-3">By region</h2>
      <div className="space-y-1.5 font-mono text-[12px]">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-ink-300 uppercase pb-1 border-b border-ink-100">
          <span>Region</span>
          <span className="text-right text-verdict-pass">Pro</span>
          <span className="text-right text-verdict-fail">Con</span>
          <span className="text-right">Neut</span>
        </div>
        {byRegion.map(([region, counts]) => (
          <div
            key={region}
            className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-ink-700"
          >
            <span>{region}</span>
            <span className="text-right text-verdict-pass tabular-nums">
              {counts.pro}
            </span>
            <span className="text-right text-verdict-fail tabular-nums">
              {counts.con}
            </span>
            <span className="text-right text-ink-500 tabular-nums">
              {counts.neutral}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TranscriptList({
  transcripts,
}: {
  transcripts: CycleProps["transcripts"];
}) {
  if (transcripts.length === 0) return null;
  return (
    <Card>
      <h2 className="text-[14px] font-semibold text-ink-900 mb-3">
        Per-persona transcripts ({transcripts.length})
      </h2>
      <div className="divide-y divide-ink-100">
        {transcripts.map((t) => (
          <details key={t.id} className="py-2">
            <summary className="cursor-pointer flex items-start gap-2 select-none">
              <span
                className={
                  t.verdict === "pro"
                    ? "text-verdict-pass font-mono text-[11px] uppercase shrink-0 w-12"
                    : t.verdict === "con"
                      ? "text-verdict-fail font-mono text-[11px] uppercase shrink-0 w-12"
                      : "text-ink-300 font-mono text-[11px] uppercase shrink-0 w-12"
                }
              >
                {t.verdict}
              </span>
              <span className="text-[13px] text-ink-900 font-semibold flex-1">
                {t.personaName}
              </span>
              <span className="text-[11px] font-mono text-ink-300 shrink-0">
                {t.personaRegion}
              </span>
            </summary>
            <div className="pl-14 pr-2 pt-2">
              {t.parseError ? (
                <div>
                  <p className="text-[11px] text-flare-600 font-mono mb-2">
                    unparseable response
                  </p>
                  <p className="text-[12px] text-ink-500 leading-relaxed whitespace-pre-wrap font-mono">
                    {t.rawText ?? "(no raw text recorded)"}
                  </p>
                </div>
              ) : (
                <>
                  {t.headline && (
                    <p className="text-[13px] text-ink-900 font-semibold mb-1">
                      {t.headline}
                    </p>
                  )}
                  {t.paragraphs.map((p, i) => (
                    <p
                      key={i}
                      className="text-[12px] text-ink-700 leading-relaxed mb-1"
                    >
                      {p}
                    </p>
                  ))}
                </>
              )}
            </div>
          </details>
        ))}
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-300">{label}</span>
      <span className="text-ink-700">{value}</span>
    </div>
  );
}

function ExportBar({
  cycleId,
  hasTranscripts,
}: {
  cycleId: string;
  hasTranscripts: boolean;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-ink-900 mb-1">
            Export this cycle
          </h2>
          <p className="text-[12px] text-ink-500 leading-relaxed">
            Executive PDF for stakeholders, or a spreadsheet with every
            persona's full reasoning for deeper analysis.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/api/cycles/${cycleId}/export.pdf`}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-ink-100 bg-canvas h-9 px-4 text-[13px] font-medium text-ink-700 transition-colors hover:border-flare-600 hover:text-flare-600 hover:bg-flare-100/40"
          >
            <PdfIcon className="h-3.5 w-3.5" />
            Executive PDF
          </a>
          <a
            href={`/api/cycles/${cycleId}/export.csv`}
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md border h-9 px-4 text-[13px] font-medium transition-colors ${
              hasTranscripts
                ? "border-ink-100 bg-canvas text-ink-700 hover:border-flare-600 hover:text-flare-600 hover:bg-flare-100/40"
                : "border-ink-100 bg-canvas text-ink-300 cursor-not-allowed pointer-events-none"
            }`}
            aria-disabled={!hasTranscripts}
            title={
              hasTranscripts
                ? "Download a row-per-persona CSV"
                : "No transcripts to export yet"
            }
          >
            <SheetIcon className="h-3.5 w-3.5" />
            Spreadsheet (CSV)
          </a>
        </div>
      </div>
    </Card>
  );
}

function PdfIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 15h6" />
      <path d="M9 11h2" />
    </svg>
  );
}

function SheetIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <path d="M9 3v18" />
      <path d="M15 3v18" />
    </svg>
  );
}
