import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import { buildCsv } from "@/lib/cycles/csv-export";

// Sprint 4 — CSV export for one-shot AskForm questions. Mirrors the
// /api/cycles/[id]/export.csv shape but reads from ProjectAsk (which is
// where /api/ask persists results).

export const dynamic = "force-dynamic";

interface PanelRow {
  agentKey?: string;
  name?: string;
  region?: string;
  industry?: string | null;
  companySize?: string | null;
  stance?: string | null;
  verdict?: string;
  sentiment?: number;
  headline?: string;
  reasoning?: string;
  parseError?: boolean;
  rawText?: string | null;
  apiError?: string | null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth();
  if (!session.firmId) {
    return new Response("Forbidden", { status: 403 });
  }
  const { id } = await params;

  const ask = await prisma.projectAsk.findUnique({
    where: { id },
    include: { project: { select: { firmId: true, name: true } } },
  });
  if (!ask) return new Response("Not found", { status: 404 });
  if (ask.project.firmId !== session.firmId) {
    return new Response("Forbidden", { status: 403 });
  }

  const responses = Array.isArray(ask.panelResult)
    ? (ask.panelResult as unknown as PanelRow[])
    : [];

  const v = (ask.validation ?? null) as {
    verdict?: "PASS" | "WARN" | "FAIL";
    confidence?: number;
    klDivergence?: number;
    bciLow?: number;
    bciHigh?: number;
    recommendedN?: number;
    reasoningTrace?: string;
    error?: string;
  } | null;

  // Sprint 7 — themes saved on ProjectAsk.summary. Convert to the CsvTheme
  // shape and pass into buildCsv so the export gains the themes table.
  const summary = (ask.summary ?? {}) as {
    themes?: {
      title?: string;
      description?: string;
      verdictMix?: { pro?: number; con?: number; neutral?: number; total?: number };
      segments?: { regions?: string[]; industries?: string[]; stances?: string[] };
    }[];
  };
  const themes = Array.isArray(summary.themes)
    ? summary.themes.map((t) => ({
        title: t.title ?? "",
        description: t.description ?? "",
        pro: t.verdictMix?.pro ?? 0,
        neutral: t.verdictMix?.neutral ?? 0,
        con: t.verdictMix?.con ?? 0,
        total: t.verdictMix?.total ?? 0,
        segments: [
          ...(t.segments?.regions ?? []),
          ...(t.segments?.industries ?? []),
          ...(t.segments?.stances ?? []),
        ],
      }))
    : [];

  const csv = buildCsv(
    {
      cycleId: ask.id,
      panelVersion: ask.project.name ?? "ask",
      completedAt: ask.createdAt,
      hypothesis: ask.question,
      isInvalid: false,
      validation:
        v && !v.error
          ? {
              verdict: v.verdict ?? null,
              confidence: v.confidence ?? null,
              klDivergence: v.klDivergence ?? null,
              bciLow: v.bciLow ?? null,
              bciHigh: v.bciHigh ?? null,
              recommendedN: v.recommendedN ?? null,
              reasoningTrace: v.reasoningTrace ?? null,
            }
          : undefined,
      themes,
    },
    responses.map((r) => ({
      personaName: r.name ?? "(unknown)",
      personaRegion: r.region ?? "(unknown)",
      industry: r.industry ?? null,
      companySize: r.companySize ?? null,
      stance: r.stance ?? null,
      verdict: r.verdict ?? "neutral",
      sentiment: r.sentiment ?? 5,
      headline: r.headline ?? "",
      reasoning: r.reasoning ?? "",
    })),
  );

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="ask-${ask.id.slice(-8)}.csv"`,
    },
  });
}
