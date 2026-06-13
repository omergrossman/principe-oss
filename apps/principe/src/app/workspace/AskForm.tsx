// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IterationTrend, type IterationSummary } from "./IterationTrend";
import { AllResponses, type PanelResponseRow } from "./AllResponses";
import { RegionalGlobe } from "./RegionalGlobe";
import { IndustryBreakdown } from "./IndustryBreakdown";

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
  byRegion: Record<string, { pro: number; con: number; neutral: number }>;
  byStance: Record<string, { pro: number; con: number; neutral: number }>;
  parseFailures: number;
  apiFailures: number;
}

import { ValidationBanner, type AskValidation } from "./ValidationBanner";
import { MarkdownLite } from "./MarkdownLite";
import { ThemesCard, type Theme } from "./ThemesCard";
import { DecisionCard } from "./DecisionCard";
import type { PanelDecision } from "@/lib/ciso-panel/decision";

interface AskResult {
  // Returned by /api/ask after ProjectAsk persistence; drives the export
  // buttons on the result card.
  askId?: string;
  question: string;
  panel: {
    responses: PanelResponseRow[];
    aggregates: PanelAggregates;
    totalInputTokens: number;
    totalOutputTokens: number;
    durationMs: number;
  };
  summary: {
    summary: string;
    topPros: string[];
    topCons: string[];
    insights: { title: string; reasoning: string }[];
    themes?: Theme[];
    decision?: PanelDecision;
  };
  // Sprint 5.5 — hybrid statistical validation. Silent on PASS; renders
  // a warning banner on WARN/FAIL. Undefined for pre-Sprint-5.5 asks.
  validation?: AskValidation;
}

interface Iteration {
  result: AskResult;
  ranAt: number;
}

type FlowState =
  | { kind: "idle"; editing: boolean }
  | { kind: "running"; question: string; startedAt: number }
  | { kind: "error"; message: string };

export function AskForm({ disabled }: { disabled: boolean }) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Iteration[]>([]);
  const [flow, setFlow] = useState<FlowState>({ kind: "idle", editing: false });

  const current = history[history.length - 1]?.result ?? null;

  // Tracks the in-flight ask so we can cancel it cleanly when the user
  // submits a follow-up question or navigates away mid-run. Without
  // this, an orphaned fetch keeps the server's progress counter ticking
  // and surfaces nonsense (e.g. "115%") on the next ask. The server-side
  // concurrent-run guard rejects fresh asks while one is pending, so we
  // ALSO need to drop the previous fetch on the client to actually
  // make progress.
  const inFlightAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      // Component unmounts (user navigated away). Abort whatever's pending.
      inFlightAbort.current?.abort();
    };
  }, []);

  // Sprint 6 — reuse from the past-asks page. `?q=<question>` prefills
  // the editor; `?run=1` auto-fires it without waiting for a submit
  // click. The router.replace strips the params after consumption so a
  // reload doesn't re-run an old reuse intent.
  const searchParams = useSearchParams();
  const router = useRouter();
  const reuseConsumed = useRef(false);
  useEffect(() => {
    if (reuseConsumed.current) return;
    const q = searchParams.get("q");
    const autorun = searchParams.get("run") === "1";
    if (!q) return;
    reuseConsumed.current = true;
    setQuestion(q);
    router.replace("/workspace");
    if (autorun && !disabled && q.trim().length >= 8) {
      void runQuestion(q.trim());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runQuestion(q: string) {
    // Cancel any in-flight previous ask so we don't end up with two
    // fetches in parallel (and the server's concurrent-run lock would
    // 409 the new one anyway).
    inFlightAbort.current?.abort();
    const controller = new AbortController();
    inFlightAbort.current = controller;

    setFlow({ kind: "running", question: q, startedAt: Date.now() });
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        setFlow({ kind: "error", message: data.error ?? "Request failed." });
        return;
      }
      setHistory((h) => [...h, { result: data as AskResult, ranAt: Date.now() }]);
      setFlow({ kind: "idle", editing: false });
    } catch (err) {
      // Aborts surface as DOMException("AbortError"). They're triggered
      // by us (user submitting again, component unmounting) — don't
      // show them as errors.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setFlow({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error.",
      });
    } finally {
      if (inFlightAbort.current === controller) inFlightAbort.current = null;
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Only block a truly empty question — the button activates on the first
    // character, so don't reject short-but-real ones here.
    if (question.trim().length === 0) return;
    void runQuestion(question.trim());
  }

  function handleIterate() {
    if (!current) return;
    void runQuestion(current.question);
  }

  function handleEdit() {
    if (!current) return;
    setQuestion(current.question);
    setFlow({ kind: "idle", editing: true });
  }

  function handleNewQuestion() {
    setHistory([]);
    setQuestion("");
    setFlow({ kind: "idle", editing: false });
  }

  function handleCancelEdit() {
    if (!current) return;
    setFlow({ kind: "idle", editing: false });
  }

  if (flow.kind === "running") {
    return (
      <div className="space-y-6">
        <QuestionRecap question={flow.question} />
        <RunningPanel startedAt={flow.startedAt} />
        {current && (
          <div className="opacity-60">
            <SectionHeader>Previous iteration result</SectionHeader>
            <ResultBody result={current} />
          </div>
        )}
      </div>
    );
  }

  if (flow.kind === "error") {
    return (
      <div className="space-y-6">
        <QuestionForm
          question={question}
          setQuestion={setQuestion}
          onSubmit={handleSubmit}
          disabled={disabled}
          submitting={false}
          editing={false}
          onCancelEdit={null}
        />
        <Card>
          <p className="text-[14px] text-verdict-fail font-semibold mb-1">
            Couldn&apos;t run the panel
          </p>
          <p className="text-[13px] text-ink-700">{flow.message}</p>
        </Card>
      </div>
    );
  }

  if (!current) {
    return (
      <QuestionForm
        question={question}
        setQuestion={setQuestion}
        onSubmit={handleSubmit}
        disabled={disabled}
        submitting={false}
        editing={false}
        onCancelEdit={null}
      />
    );
  }

  if (flow.editing) {
    return (
      <div className="space-y-6">
        <QuestionForm
          question={question}
          setQuestion={setQuestion}
          onSubmit={handleSubmit}
          disabled={disabled}
          submitting={false}
          editing={true}
          onCancelEdit={handleCancelEdit}
        />
        <SectionHeader>Last result</SectionHeader>
        <ResultBody result={current} />
      </div>
    );
  }

  const trendHistory: IterationSummary[] = history.map((h) => ({
    question: h.result.question,
    sentimentMean: h.result.panel.aggregates.sentimentMean,
    proPct: h.result.panel.aggregates.proPct,
    sentimentStdDev: h.result.panel.aggregates.sentimentStdDev,
  }));

  return (
    <div className="space-y-6">
      <ActionRow
        currentQuestion={current.question}
        onIterate={handleIterate}
        onEdit={handleEdit}
        onNew={handleNewQuestion}
      />
      {history.length > 1 && <IterationTrend history={trendHistory} />}
      <ResultBody result={current} />
    </div>
  );
}

// ─── Question entry ──────────────────────────────────────────────────

function QuestionForm({
  question,
  setQuestion,
  onSubmit,
  disabled,
  submitting,
  editing,
  onCancelEdit,
}: {
  question: string;
  setQuestion: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  disabled: boolean;
  submitting: boolean;
  editing: boolean;
  onCancelEdit: (() => void) | null;
}) {
  return (
    <form onSubmit={onSubmit}>
      <Card>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[13px] font-semibold text-ink-700">
            {editing ? "Edit your question" : "Your question"}
          </span>
          {editing && onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="text-[12px] text-ink-300 hover:text-ink-700 font-mono"
            >
              cancel
            </button>
          )}
        </div>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={4}
          maxLength={2000}
          wrap="soft"
          placeholder="e.g., Would you replace your current MDR if ours cuts MTTR 40% but takes 6 weeks to integrate?"
          disabled={disabled || submitting}
          className="block w-full max-w-full p-3 rounded-md border border-ink-100 bg-elevated text-[14px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20 leading-relaxed resize-none whitespace-pre-wrap break-words overflow-x-hidden overflow-y-auto"
        />
        <div className="flex items-center justify-between mt-3">
          <span className="text-[11px] text-ink-300 font-mono">
            {question.length} / 2000
          </span>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={disabled || submitting || question.trim().length === 0}
          >
            {submitting ? "Asking 100 CISOs…" : editing ? "Re-ask" : "Ask the panel"}
          </Button>
        </div>
      </Card>
    </form>
  );
}

function QuestionRecap({ question }: { question: string }) {
  return (
    <Card>
      <p className="text-[11px] text-ink-300 uppercase tracking-wide font-medium mb-1">
        question
      </p>
      <p className="text-[14px] text-ink-900 leading-relaxed">{question}</p>
    </Card>
  );
}

function ActionRow({
  currentQuestion,
  onIterate,
  onEdit,
  onNew,
}: {
  currentQuestion: string;
  onIterate: () => void;
  onEdit: () => void;
  onNew: () => void;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-ink-300 uppercase tracking-wide font-medium mb-1">
            question
          </p>
          <p className="text-[14px] text-ink-900 leading-relaxed">
            {currentQuestion}
          </p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          <Button variant="primary" size="sm" onClick={onIterate}>
            Iterate
          </Button>
          <Button variant="secondary" size="sm" onClick={onEdit}>
            Edit &amp; re-ask
          </Button>
          <Button variant="text" size="sm" onClick={onNew}>
            New question
          </Button>
        </div>
      </div>
    </Card>
  );
}

interface ProgressSnapshot {
  active: boolean;
  personasTotal?: number;
  personasDone?: number;
  personasFailed?: number;
  synthesisStartedAt?: number | null;
  synthesisDoneAt?: number | null;
  validationStartedAt?: number | null;
  validationDoneAt?: number | null;
  startedAt?: number;
}

// Estimated synthesis-call duration, used as the denominator for phase 3's
// progress when we know synthesis has started but not yet finished.
const SYNTH_DURATION_MS = 10_000;

function RunningPanel({ startedAt }: { startedAt: number }) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [progress, setProgress] = useState<ProgressSnapshot>({ active: false });

  // Local seconds counter ticks every 200ms.
  useEffect(() => {
    const id = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 200);
    return () => clearInterval(id);
  }, [startedAt]);

  // Real backend progress poll every 700ms.
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/ask/progress", { cache: "no-store" });
        if (!cancelled && res.ok) {
          const data = (await res.json()) as ProgressSnapshot;
          setProgress(data);
        }
      } catch {
        // ignore; next tick retries
      }
    }
    void poll();
    const id = setInterval(() => void poll(), 700);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const elapsedSec = elapsedMs / 1000;
  const phases = computeRealPhases(progress);

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <span className="inline-block w-2 h-2 rounded-full bg-flare-600 animate-pulse" />
        <h3 className="text-[15px] font-semibold text-ink-900">
          Polling the panel
        </h3>
        <span className="text-[12px] text-ink-300 font-mono ml-auto tabular-nums">
          {Math.floor(elapsedSec)}s
        </span>
      </div>
      <div className="space-y-3">
        {phases.map((p) => (
          <PhaseProgress key={p.label} phase={p} />
        ))}
      </div>
    </Card>
  );
}

interface PhaseRow {
  label: string;
  pct: number;
  status: "queued" | "running" | "done";
}

/**
 * Map the real backend progress snapshot to four phase rows. Each row
 * reflects an actual measurable event:
 *   1. Dispatching = personasDone / personasTotal × 100
 *   2. Collecting verdicts = same source (parallel to dispatch),
 *      slightly behind for visual rhythm
 *   3. Synthesising = elapsed since synthesisStartedAt, denom ~10s
 *   4. Validating panel statistics = elapsed since validationStartedAt,
 *      denom ~3s (Sprint 6 — replaced the "Rendering dashboard" synthetic
 *      placeholder, which never reflected real work)
 */
function computeRealPhases(snap: ProgressSnapshot): PhaseRow[] {
  const total = snap.personasTotal ?? 100;
  const done = snap.personasDone ?? 0;
  const dispatchPct = total > 0 ? (done / total) * 100 : 0;
  const collectPct = Math.max(0, dispatchPct - (dispatchPct < 100 ? 6 : 0));

  let synthPct = 0;
  let synthStatus: PhaseRow["status"] = "queued";
  if (snap.synthesisDoneAt) {
    synthPct = 100;
    synthStatus = "done";
  } else if (snap.synthesisStartedAt) {
    const elapsed = Date.now() - snap.synthesisStartedAt;
    synthPct = Math.min(95, (elapsed / SYNTH_DURATION_MS) * 95);
    synthStatus = "running";
  }

  // Sprint 6 — phase 4 is now the Statistician validation (~1-3s).
  // Tracked via validationStartedAt / validationDoneAt timestamps. Denom
  // tuned to ~3s which matches Modal-served PyMC warm-pool latency.
  const VALIDATION_DURATION_MS = 3000;
  let valPct = 0;
  let valStatus: PhaseRow["status"] = "queued";
  if (snap.validationDoneAt) {
    valPct = 100;
    valStatus = "done";
  } else if (snap.validationStartedAt) {
    const elapsed = Date.now() - snap.validationStartedAt;
    valPct = Math.min(95, (elapsed / VALIDATION_DURATION_MS) * 95);
    valStatus = "running";
  }

  return [
    {
      label: `Dispatching panel calls (${done}/${total})`,
      pct: dispatchPct,
      status:
        dispatchPct >= 100 ? "done" : dispatchPct > 0 ? "running" : "queued",
    },
    {
      label: "Collecting structured verdicts",
      pct: collectPct,
      status:
        collectPct >= 100 ? "done" : collectPct > 0 ? "running" : "queued",
    },
    {
      label: "Synthesising panel response",
      pct: synthPct,
      status: synthStatus,
    },
    {
      label: "Validating panel statistics",
      pct: valPct,
      status: valStatus,
    },
  ];
}

function PhaseProgress({ phase }: { phase: PhaseRow }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span
          className={`text-[12px] font-mono ${
            phase.status === "queued"
              ? "text-ink-300"
              : phase.status === "running"
                ? "text-ink-700"
                : "text-ink-500"
          }`}
        >
          {phase.label}
        </span>
        <span className="text-[11px] font-mono text-ink-300 tabular-nums">
          {Math.round(phase.pct)}%
        </span>
      </div>
      <div className="h-1 w-full bg-ink-100/60 rounded-pill overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ease-out ${
            phase.status === "queued"
              ? "bg-ink-100"
              : phase.status === "running"
                ? "bg-flare-600"
                : "bg-flare-500"
          }`}
          style={{ width: `${phase.pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────

function ExportBar({ askId }: { askId: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold text-ink-900 mb-1">
            Export this response
          </h3>
          <p className="text-[12px] text-ink-500 leading-relaxed">
            Executive PDF for stakeholders, or a spreadsheet with every
            persona&apos;s full reasoning for deeper analysis.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/api/asks/${askId}/export.pdf`}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-ink-100 bg-canvas h-9 px-4 text-[13px] font-medium text-ink-700 transition-colors hover:border-flare-600 hover:text-flare-600 hover:bg-flare-100/40"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              aria-hidden
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M9 15h6" />
              <path d="M9 11h2" />
            </svg>
            Executive PDF
          </a>
          <a
            href={`/api/asks/${askId}/export.csv`}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-ink-100 bg-canvas h-9 px-4 text-[13px] font-medium text-ink-700 transition-colors hover:border-flare-600 hover:text-flare-600 hover:bg-flare-100/40"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              aria-hidden
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M3 15h18" />
              <path d="M9 3v18" />
              <path d="M15 3v18" />
            </svg>
            Spreadsheet (CSV)
          </a>
        </div>
      </div>
    </Card>
  );
}

function ResultBody({ result }: { result: AskResult }) {
  const { panel, summary } = result;
  const [showAll, setShowAll] = useState(false);
  const rateLimitHit = detectRateLimit(panel.responses);

  return (
    <div className="space-y-6">
      {rateLimitHit && (
        <RateLimitBanner failures={panel.aggregates.apiFailures} total={panel.responses.length} />
      )}
      {result.validation && <ValidationBanner validation={result.validation} />}

      {/* Decision-grade output — the headline call sits above everything. */}
      <DecisionCard decision={summary.decision} />

      <KpiRow aggregates={panel.aggregates} />

      {/* Sprint 7 T4 — Strongest signals sits above the exec summary so a
          reader sees structured patterns before the prose. */}
      <ThemesCard themes={summary.themes ?? []} />

      <Card>
        <h3 className="text-[12px] uppercase tracking-wide font-semibold text-ink-500 mb-2">
          Executive summary
        </h3>
        <p className="text-[15px] text-ink-900 leading-relaxed whitespace-pre-wrap">
          <MarkdownLite text={summary.summary} />
        </p>
      </Card>

      {result.askId && <ExportBar askId={result.askId} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProsConsCard tone="pro" items={summary.topPros} />
        <ProsConsCard tone="con" items={summary.topCons} />
      </div>

      <InsightsCard insights={summary.insights} />

      <RegionalGlobe responses={panel.responses} />

      <IndustryBreakdown responses={panel.responses} />

      <FooterStats panel={panel} aggregates={panel.aggregates} />

      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        className="w-full text-left flex items-center justify-between gap-2 px-4 py-3 rounded-md border border-ink-100 bg-elevated hover:border-ink-300 transition-colors"
      >
        <span className="text-[14px] font-semibold text-ink-900">
          {showAll ? "Hide" : "View"} all {panel.responses.length} responses
        </span>
        <span className="text-[12px] text-ink-300 font-mono">
          {showAll ? "▲" : "▼"}
        </span>
      </button>

      {showAll && <AllResponses responses={panel.responses} />}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] uppercase tracking-wide font-semibold text-ink-300 font-mono">
      {children}
    </h2>
  );
}

function KpiRow({ aggregates }: { aggregates: PanelAggregates }) {
  const sentiment = aggregates.sentimentMean;
  const sentimentTone =
    sentiment >= 6.5 ? "pass" : sentiment >= 5 ? "warn" : "fail";
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <VerdictKpi aggregates={aggregates} />
      <Card>
        <p className="text-[11px] uppercase tracking-wide font-medium text-ink-500 mb-2">
          Sentiment
        </p>
        <p
          className={`text-[40px] font-bold leading-none tabular-nums ${toneTextClass(sentimentTone)}`}
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
  const bars: { label: string; pct: number; cls: string }[] = [
    { label: "pro", pct: aggregates.proPct, cls: "bg-verdict-pass" },
    {
      label: "neutral",
      pct: aggregates.neutralPct,
      cls: "bg-verdict-directional",
    },
    { label: "con", pct: aggregates.conPct, cls: "bg-verdict-fail" },
  ];
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
        {bars.map((b) => (
          <div
            key={b.label}
            className={b.cls}
            style={{ width: `${b.pct}%` }}
            title={`${b.label} ${b.pct}%`}
          />
        ))}
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

function FooterStats({
  panel,
  aggregates,
}: {
  panel: AskResult["panel"];
  aggregates: PanelAggregates;
}) {
  const failed = aggregates.apiFailures + aggregates.parseFailures;
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-ink-300 font-mono">
      <span>panel ran {(panel.durationMs / 1000).toFixed(1)}s</span>
      <span>
        {panel.totalInputTokens.toLocaleString()} in ·{" "}
        {panel.totalOutputTokens.toLocaleString()} out
      </span>
      {failed > 0 && (
        <span className="text-verdict-fail">
          {aggregates.apiFailures} api · {aggregates.parseFailures} parse errors
        </span>
      )}
    </div>
  );
}

// ─── Failure-mode detection ──────────────────────────────────────────

function detectRateLimit(responses: PanelResponseRow[]): boolean {
  const apiErrors = responses.filter((r) => r.apiError);
  if (apiErrors.length < 10) return false;
  const rateLimitHits = apiErrors.filter((r) =>
    /(429|rate.?limit|too many)/i.test(r.apiError ?? ""),
  ).length;
  // If half or more of the api errors look like rate limits, surface
  // the banner. Threshold avoids false positives on small failure sets.
  return rateLimitHits >= apiErrors.length / 2;
}

function RateLimitBanner({
  failures,
  total,
}: {
  failures: number;
  total: number;
}) {
  return (
    <div className="p-4 rounded-md bg-verdict-warn/10 border border-verdict-warn/30">
      <p className="text-[13px] font-semibold text-ink-900 mb-1">
        Rate limit hit — {failures} of {total} agents couldn&apos;t respond
      </p>
      <p className="text-[12px] text-ink-700 leading-relaxed">
        Anthropic&apos;s Tier 1 API limits (the default for new keys) cap
        around 50 requests per minute. Príncipe paces calls at ~40 RPM
        with 4 in flight, but a burst can still trip it. Options:
      </p>
      <ul className="text-[12px] text-ink-700 leading-relaxed mt-1.5 pl-4 list-disc">
        <li>Wait a minute and click <strong>Iterate</strong> — same question, fresh dispatch</li>
        <li>Upgrade your Anthropic key to Tier 2 at console.anthropic.com (raises the cap to 1000 RPM)</li>
        <li>
          Slow the dispatch further: set{" "}
          <code className="font-mono text-[11px] bg-ink-100/40 px-1 rounded">PRINCIPE_PANEL_CONCURRENCY=2</code>{" "}
          or raise{" "}
          <code className="font-mono text-[11px] bg-ink-100/40 px-1 rounded">PRINCIPE_PANEL_MIN_DISPATCH_INTERVAL_MS=2500</code>{" "}
          in .env.local
        </li>
      </ul>
    </div>
  );
}

// ─── Style helpers ───────────────────────────────────────────────────

function toneTextClass(tone: "pass" | "warn" | "fail"): string {
  if (tone === "pass") return "text-verdict-pass";
  if (tone === "fail") return "text-verdict-fail";
  return "text-verdict-warn";
}

function sentimentLabel(n: number): string {
  if (n >= 8) return "strongly positive";
  if (n >= 6.5) return "positive";
  if (n >= 5) return "lukewarm";
  if (n >= 3.5) return "negative";
  return "strongly negative";
}
