// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";
import { AppTopBar } from "@/components/app/AppTopBar";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { REGION_LABELS, type RegionKey } from "@/lib/canon";

export const dynamic = "force-dynamic";

export default async function PersonasIndexPage() {
  const session = await requireRole("PRINCIPE_ADMIN");

  // Pull every persona under this firm's projects + their depth-field
  // counts. Group by project for navigation.
  const personas = await prisma.projectAgent.findMany({
    where: { project: { firmId: session.firmId } },
    orderBy: [{ industry: "asc" }, { region: "asc" }, { agentKey: "asc" }],
    select: {
      id: true,
      agentKey: true,
      name: true,
      region: true,
      industry: true,
      companySize: true,
      tenure: true,
      stance: true,
      originatingTranscriptIds: true,
      signatureVocabulary: true,
      coreOpinions: true,
      personaStale: true,
      project: { select: { id: true, name: true, isDefault: true } },
    },
  });

  const grouped = new Map<string, typeof personas>();
  for (const p of personas) {
    const k = p.project.id;
    const arr = grouped.get(k) ?? [];
    arr.push(p);
    grouped.set(k, arr);
  }

  return (
    <>
      <AppTopBar />
      <main className="max-w-6xl mx-auto px-8 py-10">
        <nav className="flex items-center gap-2 text-[13px] text-ink-300 mb-3 font-mono">
          <Link href="/admin" className="hover:text-ink-700">admin</Link>
          <span>›</span>
          <span className="text-ink-700">personas</span>
        </nav>

        <header className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Pill tone="ink">Principe admin</Pill>
            {personas.length > 0 && (
              <Pill tone="default">{personas.length} personas</Pill>
            )}
          </div>
          <h1 className="text-[32px] font-bold text-ink-900 tracking-tight">
            Personas (read-only)
          </h1>
          <p className="text-ink-500 mt-2 max-w-2xl">
            Every persona under your projects with their transcript-derived
            depth. Originating transcripts shape the persona&apos;s
            established positions and vocabulary; stale personas need a
            recompute (triggered from the transcript page).
          </p>
        </header>

        {personas.length === 0 ? (
          <Card>
            <p className="text-[14px] text-ink-500 leading-relaxed">
              No personas yet. Create a project — the default 100-agent
              composition is materialised on project creation.
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            {Array.from(grouped.entries()).map(([projectId, list]) => {
              const project = list[0].project;
              const withTranscripts = list.filter(
                (p) => p.originatingTranscriptIds.length > 0,
              ).length;
              const staleCount = list.filter((p) => p.personaStale).length;
              return (
                <div key={projectId}>
                  <div className="flex items-baseline justify-between mb-2">
                    <h2 className="text-[16px] font-semibold text-ink-900">
                      {project.name}
                      {project.isDefault && (
                        <span className="text-[11px] text-ink-300 font-mono ml-2 uppercase">
                          default
                        </span>
                      )}
                    </h2>
                    <p className="text-[11px] text-ink-300 font-mono">
                      {list.length} personas · {withTranscripts} anchored
                      {staleCount > 0 && ` · ${staleCount} stale`}
                    </p>
                  </div>
                  <div className="space-y-1">
                    {list.map((p) => (
                      <Link
                        key={p.id}
                        href={`/admin/personas/${p.id}`}
                        className="block group"
                      >
                        <Card className={p.personaStale ? "border-flare-600/40" : ""}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold text-ink-900 group-hover:text-flare-600 transition-colors">
                                {p.name}
                              </p>
                              <p className="text-[11px] text-ink-300 font-mono mt-0.5 truncate">
                                {p.industry} ·{" "}
                                {REGION_LABELS[p.region as RegionKey] ?? p.region} ·{" "}
                                {p.companySize} · {p.tenure} · {p.stance}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[11px] text-ink-500 font-mono">
                                {p.originatingTranscriptIds.length} transcript
                                {p.originatingTranscriptIds.length === 1 ? "" : "s"}
                              </p>
                              <p className="text-[11px] text-ink-300 font-mono">
                                {Array.isArray(p.coreOpinions)
                                  ? (p.coreOpinions as unknown[]).length
                                  : 0}{" "}
                                opinions
                              </p>
                              {p.personaStale && (
                                <p className="text-[10px] text-flare-600 font-mono uppercase">
                                  stale
                                </p>
                              )}
                            </div>
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
