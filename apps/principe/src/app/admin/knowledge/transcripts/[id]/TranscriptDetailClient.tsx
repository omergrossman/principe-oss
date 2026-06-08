"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type Status = "PENDING" | "COMPLETE" | "FAILED";

interface Insight {
  id: string;
  insightText: string;
  kind: string;
  routingScope: "UNIVERSAL" | "TARGETED";
  applicableIndustries: string[];
  applicableRegions: string[];
  applicableFrameworks: string[];
  applicableThreatTypes: string[];
  vocabularyAnchors: string[];
  enabled: boolean;
}

export function TranscriptDetailClient({
  transcriptId,
  status: initialStatus,
  stalePersonaCount: initialStaleCount,
  insights: initialInsights,
}: {
  transcriptId: string;
  status: Status;
  stalePersonaCount: number;
  insights: Insight[];
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [staleCount, setStaleCount] = useState(initialStaleCount);
  const [insights, setInsights] = useState<Insight[]>(initialInsights);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Poll while distillation pending so insights show up live.
  useEffect(() => {
    if (status !== "PENDING") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/knowledge/transcripts/${transcriptId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data?.transcript?.distillationStatus !== "PENDING") {
          window.location.reload();
        }
      } catch {
        // network blip — keep polling
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [status, transcriptId]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  function markBusy(id: string, on: boolean) {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function toggleInsight(insight: Insight) {
    markBusy(insight.id, true);
    try {
      const res = await fetch(
        `/api/admin/knowledge/transcripts/${transcriptId}/insights/${insight.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: !insight.enabled }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        flash(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setInsights((arr) =>
        arr.map((i) => (i.id === insight.id ? { ...i, enabled: !insight.enabled } : i)),
      );
      // Editing flags personas stale per AC; bump the count in UI.
      setStaleCount((c) => Math.max(c, 1));
    } finally {
      markBusy(insight.id, false);
    }
  }

  async function handleRetry() {
    setRetrying(true);
    try {
      const res = await fetch(
        `/api/admin/knowledge/transcripts/${transcriptId}/retry`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        flash(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setStatus("PENDING");
      flash("Retry queued. Reloading when distillation completes.");
    } finally {
      setRetrying(false);
    }
  }

  async function handleRecompute() {
    setRecomputing(true);
    try {
      const res = await fetch(
        `/api/admin/knowledge/transcripts/${transcriptId}/recompute-personas`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        flash(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setStaleCount(0);
      flash(`Recomputed ${data.updatedPersonaCount} matching persona${data.updatedPersonaCount === 1 ? "" : "s"}.`);
    } finally {
      setRecomputing(false);
    }
  }

  return (
    <>
      {status === "FAILED" && (
        <div className="mb-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRetry}
            disabled={retrying}
          >
            {retrying ? "Retrying" : "Retry distillation"}
          </Button>
        </div>
      )}

      {staleCount > 0 && status === "COMPLETE" && (
        <Card className="mb-4 border-flare-600/40 bg-flare-100/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[14px] font-semibold text-ink-900 mb-1">
                {staleCount} matching persona{staleCount === 1 ? "" : "s"} stale
              </h3>
              <p className="text-[12px] text-ink-700 leading-relaxed">
                Insights changed after propagation. Recompute to re-derive
                affected personas&apos; coreOpinions and signatureVocabulary
                from the current enabled set.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleRecompute}
              disabled={recomputing}
            >
              {recomputing ? "Recomputing" : "Recompute personas"}
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="text-[16px] font-semibold text-ink-900 mb-3">
          Extracted insights ({insights.length})
        </h2>
        {status === "PENDING" && insights.length === 0 && (
          <p className="text-[13px] text-ink-500 italic">
            Distillation in progress… (polling every 3s)
          </p>
        )}
        {status === "COMPLETE" && insights.length === 0 && (
          <p className="text-[13px] text-ink-500 italic">
            Distillation completed with no insights. Try retrying — the
            distiller may have returned an empty array.
          </p>
        )}
        <div className="divide-y divide-ink-100">
          {insights.map((insight) => (
            <InsightRow
              key={insight.id}
              insight={insight}
              busy={busy.has(insight.id)}
              onToggle={() => toggleInsight(insight)}
            />
          ))}
        </div>
      </Card>

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink-900 text-canvas px-4 py-2 rounded-md shadow-lg text-[13px] font-medium"
        >
          {toast}
        </div>
      )}
    </>
  );
}

function InsightRow({
  insight,
  busy,
  onToggle,
}: {
  insight: Insight;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`py-3 ${insight.enabled ? "" : "opacity-50"}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={insight.enabled}
          onChange={onToggle}
          disabled={busy}
          className="mt-1 shrink-0 h-4 w-4 accent-flare-600"
          aria-label={`Toggle insight ${insight.id}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Tag color="ink">{insight.kind.toLowerCase().replace(/_/g, " ")}</Tag>
            <Tag color={insight.routingScope === "UNIVERSAL" ? "flare" : "default"}>
              {insight.routingScope.toLowerCase()}
            </Tag>
          </div>
          <p className="text-[13px] text-ink-900 leading-relaxed">{insight.insightText}</p>
          {(insight.applicableIndustries.length > 0 ||
            insight.applicableRegions.length > 0 ||
            insight.applicableFrameworks.length > 0 ||
            insight.applicableThreatTypes.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {insight.applicableIndustries.map((x) => (
                <Tag key={`i-${x}`} color="default" small>
                  {x}
                </Tag>
              ))}
              {insight.applicableRegions.map((x) => (
                <Tag key={`r-${x}`} color="default" small>
                  {x}
                </Tag>
              ))}
              {insight.applicableFrameworks.map((x) => (
                <Tag key={`f-${x}`} color="default" small>
                  {x}
                </Tag>
              ))}
              {insight.applicableThreatTypes.map((x) => (
                <Tag key={`t-${x}`} color="default" small>
                  ⚠ {x}
                </Tag>
              ))}
            </div>
          )}
          {insight.vocabularyAnchors.length > 0 && (
            <p className="text-[11px] text-ink-300 font-mono mt-2">
              vocab: {insight.vocabularyAnchors.map((v) => `"${v}"`).join(", ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Tag({
  color,
  small,
  children,
}: {
  color: "ink" | "flare" | "default";
  small?: boolean;
  children: React.ReactNode;
}) {
  const cls =
    color === "ink"
      ? "bg-ink-900 text-canvas border border-ink-900"
      : color === "flare"
        ? "bg-flare-100 text-flare-600 border border-flare-600/30"
        : "bg-subtle text-ink-700 border border-ink-100";
  const size = small ? "h-5 px-1.5 text-[10px]" : "h-5 px-2 text-[10px]";
  return (
    <span
      className={`inline-flex items-center ${size} rounded-pill font-mono uppercase ${cls}`}
    >
      {children}
    </span>
  );
}
