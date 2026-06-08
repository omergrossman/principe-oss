import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import { AppTopBar } from "@/components/app/AppTopBar";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { StatusPill } from "@/components/ui/StatusPill";
import { CycleResultClient, type CycleStatusUi } from "./CycleResultClient";

export const dynamic = "force-dynamic";

function derivePageTitle(
  projectName: string | null | undefined,
  completedAt: Date | null,
): string {
  if (projectName && projectName.trim()) {
    return `Executive Report — ${projectName.trim()}`;
  }
  const date = (completedAt ?? new Date()).toISOString().slice(0, 10);
  return `Executive Report — ${date}`;
}

export default async function CycleResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAuth();
  const { id } = await params;

  const cycle = await prisma.cycle.findUnique({
    where: { id },
    include: {
      hypothesis: {
        select: { id: true, content: true, mode: true, projectId: true },
      },
      validation: {
        select: {
          id: true,
          kind: true,
          confidenceScore: true,
          bciLow: true,
          bciHigh: true,
          forceOverridden: true,
          stubMode: true,
        },
      },
      transcripts: {
        select: {
          id: true,
          personaKey: true,
          personaName: true,
          personaRegion: true,
          paragraphs: true,
          rawResponse: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!cycle) notFound();
  const project = cycle.hypothesis.projectId
    ? await prisma.project.findUnique({
        where: { id: cycle.hypothesis.projectId },
        select: { name: true },
      })
    : null;
  if (cycle.createdById !== session.userId) {
    return (
      <main className="max-w-2xl mx-auto px-8 py-16 text-center">
        <h1 className="text-[28px] font-bold text-ink-900 mb-2">Not your cycle</h1>
        <p className="text-ink-500">This cycle belongs to another user.</p>
      </main>
    );
  }

  const isInvalid = cycle.validation?.forceOverridden ?? false;
  const transcriptCount = cycle.transcripts.length;
  // Cycle.status enum has 7 members; the result UI treats VALIDATING /
  // QUEUED / RUNNING / CANCELLED as "in flight" and shows the polling
  // surface. COMPLETE and FAILED have their own renders.
  const uiStatus: CycleStatusUi =
    cycle.status === "COMPLETE"
      ? "COMPLETE"
      : cycle.status === "FAILED"
        ? "FAILED"
        : cycle.status === "DRAFT"
          ? "DRAFT"
          : "RUNNING";

  return (
    <>
      <AppTopBar />
      <main className="max-w-5xl mx-auto px-8 py-10">
        <nav className="flex items-center gap-2 text-[13px] text-ink-300 mb-3 font-mono">
          <Link href="/workspace" className="hover:text-ink-700">workspace</Link>
          <span>›</span>
          <span className="text-ink-700">cycle {cycle.id.slice(-8)}</span>
        </nav>

        <header className="mb-6">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Pill tone="default">cycle</Pill>
            {cycle.status === "COMPLETE" && (
              <StatusPill variant="pass" size="sm">COMPLETE</StatusPill>
            )}
            {cycle.status === "FAILED" && (
              <StatusPill variant="fail" size="sm">FAILED</StatusPill>
            )}
            {(cycle.status === "RUNNING" ||
              cycle.status === "VALIDATING" ||
              cycle.status === "QUEUED") && (
              <StatusPill variant="warn" size="sm">{cycle.status}</StatusPill>
            )}
            {cycle.status === "DRAFT" && <Pill tone="ink">DRAFT</Pill>}
            {cycle.status === "CANCELLED" && (
              <Pill tone="default">CANCELLED</Pill>
            )}
            {isInvalid && (
              <StatusPill variant="fail" size="sm">STATISTICALLY INVALID</StatusPill>
            )}
            {cycle.validation?.stubMode && (
              <Pill tone="accent">stub-mode verdict</Pill>
            )}
          </div>
          <h1 className="text-[32px] font-bold text-ink-900 tracking-tight">
            {isInvalid && "[invalid] "}
            {derivePageTitle(project?.name, cycle.completedAt)}
          </h1>
          <p className="text-ink-500 mt-2 text-[13px]">
            Panel {cycle.panelVersion} · cycle {cycle.id.slice(-8)}
            {cycle.completedAt
              ? ` · completed ${cycle.completedAt.toISOString().slice(0, 10)}`
              : null}
            {cycle.durationSec !== null
              ? ` · ${cycle.durationSec}s`
              : null}
            {cycle.llmCostUsd
              ? ` · $${cycle.llmCostUsd.toString()} llm`
              : null}
          </p>
        </header>

        <CycleResultClient
          cycle={{
            id: cycle.id,
            status: uiStatus,
            totalPersonas: cycle.totalPersonas,
            failedReason: cycle.failedReason,
            hypothesisContent: cycle.hypothesis.content,
            isInvalid,
            initialTranscriptCount: transcriptCount,
          }}
          verdict={
            cycle.validation
              ? {
                  kind: cycle.validation.kind,
                  confidenceScore: cycle.validation.confidenceScore,
                  bciLow: cycle.validation.bciLow,
                  bciHigh: cycle.validation.bciHigh,
                  forceOverridden: cycle.validation.forceOverridden,
                }
              : null
          }
          execSummary={{
            summary:
              typeof cycle.summaryText === "string" ? cycle.summaryText : null,
            topPros: Array.isArray(cycle.topPros)
              ? (cycle.topPros as string[])
              : [],
            topCons: Array.isArray(cycle.topCons)
              ? (cycle.topCons as string[])
              : [],
            insights: Array.isArray(cycle.insights)
              ? (cycle.insights as { title: string; reasoning: string }[])
              : [],
          }}
          transcripts={cycle.transcripts.map((t) => {
            const raw = (t.rawResponse ?? {}) as {
              verdict?: string;
              sentiment?: number;
              headline?: string;
              parseError?: boolean;
              rawText?: string | null;
            };
            return {
              id: t.id,
              personaName: t.personaName,
              personaRegion: t.personaRegion,
              paragraphs: t.paragraphs,
              verdict: raw.verdict ?? "neutral",
              sentiment: raw.sentiment ?? 5,
              headline: raw.headline ?? "",
              parseError: raw.parseError ?? false,
              rawText: raw.rawText ?? null,
            };
          })}
        />

        <Card className="mt-6">
          <h2 className="text-[14px] font-semibold text-ink-900 mb-2">Hypothesis</h2>
          <p className="text-[13px] text-ink-700 whitespace-pre-wrap leading-relaxed font-mono">
            {cycle.hypothesis.content}
          </p>
        </Card>
      </main>
    </>
  );
}
