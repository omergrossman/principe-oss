// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { AppTopBar } from "@/components/app/AppTopBar";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { prisma } from "@/lib/db/prisma";
import { getProject } from "@/lib/projects/repo";

export const dynamic = "force-dynamic";

export default async function ProjectHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAuth(`/projects/${id}/history`);
  if (!session.firmId) {
    return <p className="p-8 text-ink-500">Organisation required.</p>;
  }

  const project = await getProject(session.firmId, id);
  if (!project) {
    return (
      <main className="max-w-3xl mx-auto px-8 py-16 text-center">
        <h1 className="text-[28px] font-bold text-ink-900 mb-2">
          Project not found
        </h1>
        <p className="text-ink-500 mb-6">It may have been archived or never existed.</p>
        <Button href="/projects" variant="primary" size="md">
          Back to projects
        </Button>
      </main>
    );
  }

  const asks = await prisma.projectAsk.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      question: true,
      createdAt: true,
      tokensIn: true,
      tokensOut: true,
      costUsd: true,
      durationMs: true,
      aggregates: true,
      validation: true,
    },
  });

  const monthlyTotalUsd = asks
    .filter((a) => sameMonth(a.createdAt, new Date()))
    .reduce((acc, a) => acc + Number(a.costUsd), 0);

  return (
    <>
      <AppTopBar />
      <main className="max-w-5xl mx-auto px-8 py-10">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-500 hover:text-ink-900 transition-colors mb-3 font-medium"
        >
          <span aria-hidden>←</span>
          Back to projects
        </Link>
        <nav className="flex items-center gap-2 text-[13px] text-ink-300 mb-3 font-mono">
          <Link href="/projects" className="hover:text-ink-700">
            projects
          </Link>
          <span>›</span>
          <Link
            href={`/projects/${id}/select`}
            className="text-ink-700 hover:text-flare-600 transition-colors"
          >
            {project.name}
          </Link>
          <span>›</span>
          <span className="text-ink-700">history</span>
        </nav>

        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              {asks.length > 0 && (
                <Pill tone="accent">{asks.length} {asks.length === 1 ? "ask" : "asks"}</Pill>
              )}
              {project.isDefault && <Pill tone="default">default</Pill>}
            </div>
            <Link
              href={`/projects/${id}/select`}
              className="group inline-flex items-baseline gap-2 hover:text-flare-600 transition-colors"
              title={`Open ${project.name} — ask the panel`}
            >
              <h1 className="text-[36px] font-bold text-ink-900 tracking-tight group-hover:text-flare-600 transition-colors">
                {project.name}
              </h1>
              <span className="text-[20px] text-ink-300 group-hover:text-flare-600 transition-colors" aria-hidden>
                ↩
              </span>
            </Link>
            <p className="text-ink-500 mt-2 max-w-2xl">
              {asks.length > 0
                ? "Past asks in this project. Click any row to re-open the full dashboard from saved data."
                : "This project hasn't been asked anything yet. Once you run a question, every response lands here automatically."}
            </p>
            <p className="text-[12px] text-ink-300 mt-2 font-mono">
              this month: ${monthlyTotalUsd.toFixed(2)} ·{" "}
              {project.agentsCount} agents materialised
            </p>
          </div>
          <Button href="/workspace" variant="primary" size="md">
            Ask a new question
          </Button>
        </header>

        {asks.length === 0 ? (
          <Card>
            <p className="text-[14px] text-ink-500 leading-relaxed">
              No asks yet. Click <strong>Ask a new question</strong> to run
              the panel — the result will land here automatically.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {asks.map((a) => (
              <Link
                key={a.id}
                href={`/projects/${id}/history/${a.id}`}
                className="block group"
              >
                <Card>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] text-ink-900 group-hover:text-flare-600 transition-colors line-clamp-2 leading-snug">
                        {a.question}
                      </p>
                      <div className="flex gap-4 mt-2 text-[11px] text-ink-300 font-mono items-center">
                        <span>{a.createdAt.toISOString().slice(0, 10)}</span>
                        <span>{(a.durationMs / 1000).toFixed(1)}s</span>
                        <span>${Number(a.costUsd).toFixed(3)}</span>
                        <span>
                          {a.tokensIn.toLocaleString()} in ·{" "}
                          {a.tokensOut.toLocaleString()} out
                        </span>
                        <ValidationChip validation={a.validation} />
                      </div>
                    </div>
                    <SentimentKpi aggregates={a.aggregates} />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

/**
 * Sprint 6 — compact statistical-validation chip on each past-ask row.
 * Silent on PASS and on legacy/unavailable validations (matches the
 * Sprint 5.5 ValidationBanner's silent-on-PASS contract). Visible only
 * when a viewer should be cautioned about the verdict.
 */
function ValidationChip({ validation }: { validation: unknown }) {
  if (!validation || typeof validation !== "object") return null;
  const v = validation as Record<string, unknown>;
  if (v.error) return null;
  const verdict = typeof v.verdict === "string" ? v.verdict : null;
  if (!verdict || verdict === "PASS") return null;
  const isFail = verdict === "FAIL";
  return (
    <span
      title={isFail ? "Statistically weak panel for this question" : "Statistically thin sample for this question"}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
        isFail
          ? "bg-verdict-fail/15 text-verdict-fail border border-verdict-fail/30"
          : "bg-verdict-directional/15 text-verdict-directional border border-verdict-directional/30"
      }`}
    >
      ⚠ {verdict.toLowerCase()}
    </span>
  );
}

function SentimentKpi({ aggregates }: { aggregates: unknown }) {
  if (!aggregates || typeof aggregates !== "object") return null;
  const a = aggregates as Record<string, unknown>;
  const sentiment = typeof a.sentimentMean === "number" ? a.sentimentMean : null;
  const proPct = typeof a.proPct === "number" ? a.proPct : null;
  if (sentiment === null && proPct === null) return null;
  return (
    <div className="shrink-0 text-right">
      {sentiment !== null && (
        <p className="text-[20px] font-bold text-ink-900 leading-none tabular-nums">
          {sentiment.toFixed(1)}
          <span className="text-[12px] text-ink-300 font-mono ml-1">/ 10</span>
        </p>
      )}
      {proPct !== null && (
        <p className="text-[11px] text-ink-500 mt-1 font-mono">
          {proPct}% pro
        </p>
      )}
    </div>
  );
}

function sameMonth(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth()
  );
}
