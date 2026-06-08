// SPDX-License-Identifier: AGPL-3.0-or-later
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import { renderCycleReport, type PdfCycleData } from "@/lib/cycles/pdf-export";

function computeOverallSentiment(
  values: number[],
): { mean: number; stdDev: number; spreadLabel: string } | null {
  if (values.length === 0) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const spreadLabel =
    stdDev < 1.2
      ? "tight consensus"
      : stdDev < 2.2
        ? "moderate spread"
        : "wide spread";
  return { mean, stdDev, spreadLabel };
}

// PDF generation is CPU-heavy; force Node runtime (not Edge).
export const runtime = "nodejs";
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
      hypothesis: {
        select: { content: true, projectId: true },
      },
      validation: {
        select: {
          kind: true,
          confidenceScore: true,
          bciLow: true,
          bciHigh: true,
          klDivergence: true,
          recommendedN: true,
          reasoning: true,
          forceOverridden: true,
        },
      },
      transcripts: {
        select: { personaRegion: true, rawResponse: true },
      },
    },
  });
  if (!cycle) {
    return new Response("Not found", { status: 404 });
  }
  if (cycle.createdById !== session.userId) {
    return new Response("Forbidden", { status: 403 });
  }

  const project = cycle.hypothesis.projectId
    ? await prisma.project.findUnique({
        where: { id: cycle.hypothesis.projectId },
        select: { name: true },
      })
    : null;

  // Regional breakdown — group transcripts by region, count verdicts +
  // sum sentiment for mean. Overall sentiment computed in the same pass.
  type RegionAgg = {
    pro: number;
    con: number;
    neutral: number;
    sentimentSum: number;
    sentimentCount: number;
  };
  const byRegion = new Map<string, RegionAgg>();
  const sentimentValues: number[] = [];
  for (const t of cycle.transcripts) {
    const raw = (t.rawResponse ?? {}) as {
      verdict?: string;
      sentiment?: number;
    };
    const v = raw.verdict === "pro" ? "pro" : raw.verdict === "con" ? "con" : "neutral";
    const row = byRegion.get(t.personaRegion) ?? {
      pro: 0,
      con: 0,
      neutral: 0,
      sentimentSum: 0,
      sentimentCount: 0,
    };
    row[v] += 1;
    if (typeof raw.sentiment === "number" && Number.isFinite(raw.sentiment)) {
      row.sentimentSum += raw.sentiment;
      row.sentimentCount += 1;
      sentimentValues.push(raw.sentiment);
    }
    byRegion.set(t.personaRegion, row);
  }
  const regionalBreakdown = Array.from(byRegion.entries())
    .map(([region, r]) => ({
      region,
      pro: r.pro,
      con: r.con,
      neutral: r.neutral,
      total: r.pro + r.con + r.neutral,
      sentimentMean: r.sentimentCount > 0 ? r.sentimentSum / r.sentimentCount : null,
    }))
    .sort((a, b) => a.region.localeCompare(b.region));

  const sentiment = computeOverallSentiment(sentimentValues);

  const data: PdfCycleData = {
    cycleId: cycle.id,
    panelVersion: cycle.panelVersion,
    projectName: project?.name ?? null,
    status: cycle.status,
    completedAt: cycle.completedAt,
    durationSec: cycle.durationSec,
    llmCostUsd: cycle.llmCostUsd ? cycle.llmCostUsd.toString() : null,
    hypothesis: cycle.hypothesis.content,
    isInvalid: cycle.validation?.forceOverridden ?? false,
    verdict: cycle.validation
      ? {
          kind: cycle.validation.kind,
          confidenceScore: cycle.validation.confidenceScore,
          bciLow: cycle.validation.bciLow,
          bciHigh: cycle.validation.bciHigh,
          klDivergence: cycle.validation.klDivergence ?? null,
          recommendedN: cycle.validation.recommendedN ?? null,
          reasoningTrace:
            (cycle.validation.reasoning as { reasoningTrace?: string } | null)
              ?.reasoningTrace ?? null,
        }
      : null,
    execSummary: {
      summary: typeof cycle.summaryText === "string" ? cycle.summaryText : null,
      topPros: Array.isArray(cycle.topPros) ? (cycle.topPros as string[]) : [],
      topCons: Array.isArray(cycle.topCons) ? (cycle.topCons as string[]) : [],
      insights: Array.isArray(cycle.insights)
        ? (cycle.insights as { title: string; reasoning: string }[])
        : [],
      // Sprint 7 — themes were added to ProjectAsk.summary only; Cycle
      // doesn't store them yet. Render with no themes (section is silent
      // when empty).
      themes: [],
    },
    regionalBreakdown,
    sentiment,
    totals: {
      totalPersonas: cycle.totalPersonas,
      transcriptCount: cycle.transcripts.length,
    },
  };

  const pdfBuffer = await renderCycleReport(data);

  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="cycle-${cycle.id.slice(-8)}-executive.pdf"`,
    },
  });
}
