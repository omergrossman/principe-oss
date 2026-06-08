import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";
import { AppTopBar } from "@/components/app/AppTopBar";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { REGION_LABELS, type RegionKey } from "@/lib/canon";

export const dynamic = "force-dynamic";

interface CoreOpinion {
  topic: string;
  position: string;
  sourceTranscriptId: string;
  sourceInsightId: string;
  kind: string;
  applicableThreatTypes?: string[];
  createdAt: string;
}

export default async function PersonaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole("PRINCIPE_ADMIN");
  const { id } = await params;

  const persona = await prisma.projectAgent.findFirst({
    where: { id, project: { firmId: session.firmId } },
    include: { project: { select: { id: true, name: true, isDefault: true } } },
  });
  if (!persona) notFound();

  const opinions = Array.isArray(persona.coreOpinions)
    ? (persona.coreOpinions as unknown as CoreOpinion[])
    : [];

  const transcripts =
    persona.originatingTranscriptIds.length > 0
      ? await prisma.transcript.findMany({
          where: {
            id: { in: persona.originatingTranscriptIds },
            firmId: session.firmId,
          },
          select: {
            id: true,
            speakerName: true,
            speakerRole: true,
            sourceTitle: true,
            addedAt: true,
          },
        })
      : [];

  return (
    <>
      <AppTopBar />
      <main className="max-w-4xl mx-auto px-8 py-10">
        <nav className="flex items-center gap-2 text-[13px] text-ink-300 mb-3 font-mono">
          <Link href="/admin" className="hover:text-ink-700">admin</Link>
          <span>›</span>
          <Link href="/admin/personas" className="hover:text-ink-700">personas</Link>
          <span>›</span>
          <span className="text-ink-700">{persona.name}</span>
        </nav>

        <header className="mb-6">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Pill tone="ink">Principe admin</Pill>
            {persona.personaStale && (
              <Pill tone="accent">stale — recompute from transcript page</Pill>
            )}
          </div>
          <h1 className="text-[28px] font-bold text-ink-900 tracking-tight">
            {persona.name}
          </h1>
          <p className="text-ink-500 mt-2">
            {persona.industry} ·{" "}
            {REGION_LABELS[persona.region as RegionKey] ?? persona.region} ·{" "}
            {persona.companySize} · {persona.tenure} · {persona.stance}
          </p>
          <p className="text-[12px] text-ink-300 mt-1 font-mono">
            project {persona.project.name} · agent {persona.agentKey}
          </p>
        </header>

        <Card className="mb-4">
          <h2 className="text-[14px] font-semibold text-ink-900 mb-3">
            Originating transcripts ({transcripts.length})
          </h2>
          {transcripts.length === 0 ? (
            <p className="text-[13px] text-ink-500 italic">
              No transcripts anchor this persona yet. Add a transcript whose
              speaker industry + region match this persona to populate the
              depth fields below.
            </p>
          ) : (
            <ul className="space-y-1">
              {transcripts.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/admin/knowledge/transcripts/${t.id}`}
                    className="text-[13px] text-ink-700 hover:text-flare-600 transition-colors"
                  >
                    {t.speakerName} ({t.speakerRole}) — {t.sourceTitle}
                    <span className="text-[11px] text-ink-300 font-mono ml-2">
                      {t.addedAt.toISOString().slice(0, 10)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="mb-4">
          <h2 className="text-[14px] font-semibold text-ink-900 mb-3">
            Core opinions ({opinions.length})
          </h2>
          {opinions.length === 0 ? (
            <p className="text-[13px] text-ink-500 italic">
              No established positions yet. Targeted insights from matching
              transcripts populate this list.
            </p>
          ) : (
            <ul className="space-y-3">
              {opinions.map((op, i) => (
                <li key={i} className="border-l-2 border-ink-100 pl-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-ink-500 uppercase">
                      {op.topic}
                    </span>
                    <span className="text-[10px] font-mono text-ink-300">
                      {op.createdAt.slice(0, 10)}
                    </span>
                  </div>
                  <p className="text-[13px] text-ink-700 leading-relaxed">
                    {op.position}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-[14px] font-semibold text-ink-900 mb-3">
            Signature vocabulary ({persona.signatureVocabulary.length})
          </h2>
          {persona.signatureVocabulary.length === 0 ? (
            <p className="text-[13px] text-ink-500 italic">
              No vocabulary anchors yet.
            </p>
          ) : (
            <p className="text-[13px] text-ink-700 font-mono leading-relaxed">
              {persona.signatureVocabulary.map((v) => `"${v}"`).join(", ")}
            </p>
          )}
        </Card>
      </main>
    </>
  );
}
