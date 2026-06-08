// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";
import { AppTopBar } from "@/components/app/AppTopBar";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { REGION_LABELS, type RegionKey } from "@/lib/canon";
import { TranscriptDetailClient } from "./TranscriptDetailClient";

export const dynamic = "force-dynamic";

export default async function TranscriptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole("PRINCIPE_ADMIN");
  const { id } = await params;

  const transcript = await prisma.transcript.findFirst({
    where: { id, firmId: session.firmId },
    include: {
      insights: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!transcript) notFound();

  // Count personas matching speaker industry + region (potential propagation targets).
  const matchingPersonaCount = await prisma.projectAgent.count({
    where: {
      industry: transcript.speakerIndustry,
      region: transcript.speakerRegion,
      project: { firmId: session.firmId },
    },
  });
  const stalePersonaCount = await prisma.projectAgent.count({
    where: {
      industry: transcript.speakerIndustry,
      region: transcript.speakerRegion,
      project: { firmId: session.firmId },
      personaStale: true,
    },
  });

  return (
    <>
      <AppTopBar />
      <main className="max-w-5xl mx-auto px-8 py-10">
        <nav className="flex items-center gap-2 text-[13px] text-ink-300 mb-3 font-mono">
          <Link href="/admin" className="hover:text-ink-700">admin</Link>
          <span>›</span>
          <Link href="/admin/knowledge" className="hover:text-ink-700">knowledge</Link>
          <span>›</span>
          <Link href="/admin/knowledge/transcripts" className="hover:text-ink-700">transcripts</Link>
          <span>›</span>
          <span className="text-ink-700">{transcript.speakerName}</span>
        </nav>

        <header className="mb-6">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Pill tone="ink">Principe admin</Pill>
            <StatusPill status={transcript.distillationStatus} />
            {stalePersonaCount > 0 && (
              <Pill tone="accent">{stalePersonaCount} stale personas</Pill>
            )}
          </div>
          <h1 className="text-[28px] font-bold text-ink-900 tracking-tight">
            {transcript.speakerName} — {transcript.speakerRole}
          </h1>
          <p className="text-ink-500 mt-2">
            {transcript.sourceTitle}
            {transcript.sourceUrl && (
              <>
                {" · "}
                <a
                  href={transcript.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-flare-600 hover:text-flare-500 underline underline-offset-4"
                >
                  source
                </a>
              </>
            )}
          </p>
          <p className="text-[12px] text-ink-300 mt-2 font-mono">
            {transcript.speakerIndustry} ·{" "}
            {REGION_LABELS[transcript.speakerRegion as RegionKey] ?? transcript.speakerRegion} ·{" "}
            {transcript.speakerCompanySize} · {matchingPersonaCount} matching personas ·{" "}
            {transcript.insights.length} insight{transcript.insights.length === 1 ? "" : "s"} ·
            added {transcript.addedAt.toISOString().slice(0, 10)}
          </p>
        </header>

        {transcript.distillationStatus === "FAILED" && transcript.distillationError && (
          <Card className="mb-4 border-verdict-fail/40">
            <h3 className="text-[14px] font-semibold text-verdict-fail mb-1">
              Distillation failed
            </h3>
            <p className="text-[12px] text-ink-700 font-mono mb-3 whitespace-pre-wrap">
              {transcript.distillationError}
            </p>
          </Card>
        )}

        <TranscriptDetailClient
          transcriptId={transcript.id}
          status={transcript.distillationStatus}
          stalePersonaCount={stalePersonaCount}
          insights={transcript.insights.map((i) => ({
            id: i.id,
            insightText: i.insightText,
            kind: i.kind,
            routingScope: i.routingScope,
            applicableIndustries: i.applicableIndustries,
            applicableRegions: i.applicableRegions,
            applicableFrameworks: i.applicableFrameworks,
            applicableThreatTypes: i.applicableThreatTypes,
            vocabularyAnchors: i.vocabularyAnchors,
            enabled: i.enabled,
          }))}
        />

        <Card className="mt-6">
          <details>
            <summary className="cursor-pointer text-[14px] font-semibold text-ink-900 select-none">
              Raw transcript ({transcript.rawTranscript.length.toLocaleString()} chars)
            </summary>
            <pre className="mt-3 text-[11px] text-ink-700 font-mono whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-y-auto">
              {transcript.rawTranscript}
            </pre>
          </details>
        </Card>
      </main>
    </>
  );
}

function StatusPill({ status }: { status: "PENDING" | "COMPLETE" | "FAILED" }) {
  const cls =
    status === "COMPLETE"
      ? "bg-verdict-pass/12 text-verdict-pass border-verdict-pass/30"
      : status === "FAILED"
        ? "bg-verdict-fail/12 text-verdict-fail border-verdict-fail/30"
        : "bg-flare-100 text-flare-600 border-flare-600/30";
  return (
    <span
      className={`inline-flex items-center h-6 px-2.5 rounded-pill text-[11px] font-mono uppercase border ${cls}`}
    >
      {status === "PENDING" ? "distilling" : status === "COMPLETE" ? "ready" : "failed"}
    </span>
  );
}
