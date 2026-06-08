import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";
import { AppTopBar } from "@/components/app/AppTopBar";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { REGION_LABELS, type RegionKey } from "@/lib/canon";

export const dynamic = "force-dynamic";

export default async function TranscriptsIndexPage() {
  const session = await requireRole("PRINCIPE_ADMIN");
  const transcripts = await prisma.transcript.findMany({
    where: { firmId: session.firmId },
    orderBy: { addedAt: "desc" },
    select: {
      id: true,
      speakerName: true,
      speakerRole: true,
      speakerIndustry: true,
      speakerRegion: true,
      sourceTitle: true,
      distillationStatus: true,
      addedAt: true,
      _count: { select: { insights: true } },
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
          <span className="text-ink-700">transcripts</span>
        </nav>

        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Pill tone="ink">Principe admin</Pill>
              {transcripts.length > 0 && (
                <Pill tone="default">
                  {transcripts.length} {transcripts.length === 1 ? "transcript" : "transcripts"}
                </Pill>
              )}
            </div>
            <h1 className="text-[32px] font-bold text-ink-900 tracking-tight">
              CISO transcripts
            </h1>
            <p className="text-ink-500 mt-2 max-w-2xl">
              Curated talks from public CISO presentations. Each transcript
              distills into typed insights that route into agent briefings
              and anchor matching personas&apos; opinions.
            </p>
          </div>
          <Button
            href="/admin/knowledge/transcripts/new"
            variant="primary"
            size="md"
          >
            Add transcript
          </Button>
        </header>

        {transcripts.length === 0 ? (
          <Card>
            <p className="text-[14px] text-ink-500 leading-relaxed">
              No transcripts yet. <Link href="/admin/knowledge/transcripts/new" className="text-flare-600 hover:text-flare-500 underline underline-offset-4">Add your first</Link> — paste a CISO talk transcript with speaker context and distillation extracts typed insights automatically.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {transcripts.map((t) => (
              <Link
                key={t.id}
                href={`/admin/knowledge/transcripts/${t.id}`}
                className="block group"
              >
                <Card>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-[14px] font-semibold text-ink-900 group-hover:text-flare-600 transition-colors">
                          {t.speakerName}
                        </p>
                        <span className="text-[12px] text-ink-500">·</span>
                        <span className="text-[12px] text-ink-500">{t.speakerRole}</span>
                        <StatusPill status={t.distillationStatus} />
                      </div>
                      <p className="text-[12px] text-ink-700 truncate">{t.sourceTitle}</p>
                      <div className="flex gap-3 mt-1 text-[11px] text-ink-300 font-mono">
                        <span>{t.speakerIndustry}</span>
                        <span>{REGION_LABELS[t.speakerRegion as RegionKey] ?? t.speakerRegion}</span>
                        <span>{t._count.insights} insight{t._count.insights === 1 ? "" : "s"}</span>
                        <span>{t.addedAt.toISOString().slice(0, 10)}</span>
                      </div>
                    </div>
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

function StatusPill({ status }: { status: "PENDING" | "COMPLETE" | "FAILED" }) {
  const cls =
    status === "COMPLETE"
      ? "bg-verdict-pass/12 text-verdict-pass border-verdict-pass/30"
      : status === "FAILED"
        ? "bg-verdict-fail/12 text-verdict-fail border-verdict-fail/30"
        : "bg-flare-100 text-flare-600 border-flare-600/30";
  return (
    <span
      className={`inline-flex items-center h-5 px-2 rounded-pill text-[10px] font-mono uppercase border ${cls}`}
    >
      {status === "PENDING" ? "distilling" : status === "COMPLETE" ? "ready" : "failed"}
    </span>
  );
}
