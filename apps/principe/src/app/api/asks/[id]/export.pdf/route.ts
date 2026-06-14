// SPDX-License-Identifier: AGPL-3.0-or-later
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import { renderCycleReport, type PdfCycleData } from "@/lib/cycles/pdf-export";

// Sprint 4 — Executive PDF for one-shot AskForm questions. Mirrors
// /api/cycles/[id]/export.pdf but reads from ProjectAsk.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PanelRow {
  region?: string;
  industry?: string;
  verdict?: string;
  sentiment?: number;
}

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

interface Summary {
  summary?: string;
  topPros?: string[];
  topCons?: string[];
  insights?: { title: string; reasoning: string }[];
  themes?: {
    title: string;
    description: string;
    verdictMix: { pro: number; con: number; neutral: number; total: number };
    segments?: { regions: string[]; industries: string[]; stances: string[] };
  }[];
  decision?: import("@/lib/ciso-panel/decision").PanelDecision | null;
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
    include: {
      project: { select: { firmId: true, name: true, ownerUserId: true } },
    },
  });
  if (!ask) return new Response("Not found", { status: 404 });
  const isAdminViewer =
    session.role === "VC_ADMIN" || session.role === "PRINCIPE_ADMIN";
  if (
    ask.project.firmId !== session.firmId ||
    (!isAdminViewer && ask.project.ownerUserId !== session.userId)
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  const responses = Array.isArray(ask.panelResult)
    ? (ask.panelResult as unknown as PanelRow[])
    : [];
  const summary = (ask.summary ?? {}) as Summary;

  type RegionAgg = {
    pro: number;
    con: number;
    neutral: number;
    sentimentSum: number;
    sentimentCount: number;
  };
  const byRegion = new Map<string, RegionAgg>();
  const sentimentValues: number[] = [];
  for (const r of responses) {
    const region = r.region ?? "(unknown)";
    const v = r.verdict === "pro" ? "pro" : r.verdict === "con" ? "con" : "neutral";
    const row = byRegion.get(region) ?? {
      pro: 0,
      con: 0,
      neutral: 0,
      sentimentSum: 0,
      sentimentCount: 0,
    };
    row[v] += 1;
    if (typeof r.sentiment === "number" && Number.isFinite(r.sentiment)) {
      row.sentimentSum += r.sentiment;
      row.sentimentCount += 1;
      sentimentValues.push(r.sentiment);
    }
    byRegion.set(region, row);
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

  // Industry verdict split — summarised for the PDF (top by coverage; the
  // component truncates and notes the rest, so it stays compact).
  const byIndustry = new Map<string, { pro: number; con: number; neutral: number }>();
  for (const r of responses) {
    const ind = r.industry ?? "(unknown)";
    const verd = r.verdict === "pro" ? "pro" : r.verdict === "con" ? "con" : "neutral";
    const row = byIndustry.get(ind) ?? { pro: 0, con: 0, neutral: 0 };
    row[verd] += 1;
    byIndustry.set(ind, row);
  }
  const industryBreakdown = Array.from(byIndustry.entries())
    .map(([industry, r]) => ({
      industry,
      pro: r.pro,
      con: r.con,
      neutral: r.neutral,
      total: r.pro + r.con + r.neutral,
    }))
    .sort((a, b) => b.total - a.total);

  const sentiment = computeOverallSentiment(sentimentValues);

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

  const verdictForPdf =
    v && !v.error && v.verdict
      ? {
          kind: v.verdict,
          confidenceScore: v.confidence ?? 0,
          bciLow: v.bciLow ?? null,
          bciHigh: v.bciHigh ?? null,
          klDivergence: v.klDivergence ?? null,
          recommendedN: v.recommendedN ?? null,
          reasoningTrace: v.reasoningTrace ?? null,
        }
      : null;

  const data: PdfCycleData = {
    cycleId: ask.id,
    panelVersion: "CISO panel",
    projectName: ask.project.name ?? null,
    status: "COMPLETE",
    completedAt: ask.createdAt,
    durationSec: Math.round(ask.durationMs / 1000),
    llmCostUsd: ask.costUsd.toString(),
    hypothesis: ask.question,
    isInvalid: false,
    verdict: verdictForPdf,
    execSummary: {
      summary: summary.summary ?? null,
      topPros: summary.topPros ?? [],
      topCons: summary.topCons ?? [],
      insights: summary.insights ?? [],
      themes: summary.themes ?? [],
      decision: summary.decision ?? null,
    },
    regionalBreakdown,
    industryBreakdown,
    sentiment,
    totals: {
      totalPersonas: responses.length,
      transcriptCount: responses.length,
    },
  };

  const pdfBuffer = await renderCycleReport(data);
  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="ask-${ask.id.slice(-8)}-executive.pdf"`,
    },
  });
}
