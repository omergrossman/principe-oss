import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import { buildCsv } from "@/lib/cycles/csv-export";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth();
  const { id } = await params;

  const cycle = await prisma.cycle.findUnique({
    where: { id },
    include: {
      hypothesis: { select: { content: true } },
      validation: {
        select: {
          kind: true,
          confidenceScore: true,
          klDivergence: true,
          bciLow: true,
          bciHigh: true,
          recommendedN: true,
          reasoning: true,
          forceOverridden: true,
        },
      },
      transcripts: {
        select: {
          personaName: true,
          personaRegion: true,
          rawResponse: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!cycle) {
    return new Response("Not found", { status: 404 });
  }
  if (cycle.createdById !== session.userId) {
    return new Response("Forbidden", { status: 403 });
  }

  const csv = buildCsv(
    {
      cycleId: cycle.id,
      panelVersion: cycle.panelVersion,
      completedAt: cycle.completedAt,
      hypothesis: cycle.hypothesis.content,
      isInvalid: cycle.validation?.forceOverridden ?? false,
      validation: cycle.validation
        ? {
            verdict: cycle.validation.kind,
            confidence: cycle.validation.confidenceScore,
            klDivergence: cycle.validation.klDivergence ?? null,
            bciLow: cycle.validation.bciLow ?? null,
            bciHigh: cycle.validation.bciHigh ?? null,
            recommendedN: cycle.validation.recommendedN ?? null,
            reasoningTrace:
              (cycle.validation.reasoning as { reasoningTrace?: string } | null)
                ?.reasoningTrace ?? null,
          }
        : undefined,
    },
    cycle.transcripts.map((t) => {
      const raw = (t.rawResponse ?? {}) as {
        verdict?: string;
        sentiment?: number;
        headline?: string;
        reasoning?: string;
        industry?: string | null;
        companySize?: string | null;
        stance?: string | null;
      };
      return {
        personaName: t.personaName,
        personaRegion: t.personaRegion,
        industry: raw.industry ?? null,
        companySize: raw.companySize ?? null,
        stance: raw.stance ?? null,
        verdict: raw.verdict ?? "neutral",
        sentiment: raw.sentiment ?? 5,
        headline: raw.headline ?? "",
        reasoning: raw.reasoning ?? "",
      };
    }),
  );

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="cycle-${cycle.id.slice(-8)}.csv"`,
    },
  });
}
