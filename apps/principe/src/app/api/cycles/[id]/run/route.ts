import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAnthropicClientForFirm } from "@/lib/anthropic/client";
import { runPanelAsk } from "@/lib/ciso-panel/ask";
import { synthesizePanel } from "@/lib/ciso-panel/synthesize";

// Haiku 4.5 pricing per million tokens (approximate, used for accounting only).
const PRICE_INPUT_PER_MTOK = 0.8;
const PRICE_OUTPUT_PER_MTOK = 4.0;

function computeCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * PRICE_INPUT_PER_MTOK +
    (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_MTOK
  );
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth();
  if (!session.firmId) {
    return NextResponse.json(
      { error: "Organisation context required." },
      { status: 400 },
    );
  }
  const { id } = await params;

  const cycle = await prisma.cycle.findUnique({
    where: { id },
    include: {
      hypothesis: {
        select: { id: true, content: true, projectId: true, createdById: true },
      },
    },
  });
  if (!cycle) {
    return NextResponse.json({ error: "Cycle not found." }, { status: 404 });
  }
  if (cycle.createdById !== session.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!cycle.hypothesis.projectId) {
    return NextResponse.json(
      { error: "Hypothesis is not attached to a project." },
      { status: 400 },
    );
  }

  // Pre-flight: Anthropic key must be configured. Fail fast (400) so the
  // cycle stays DRAFT and the user can fix it in Settings before retrying.
  try {
    await getAnthropicClientForFirm(session.firmId);
  } catch (e) {
    if (e instanceof Error && e.message === "ANTHROPIC_KEY_MISSING") {
      return NextResponse.json(
        { error: "Anthropic key required — configure in Settings." },
        { status: 400 },
      );
    }
    throw e;
  }

  // Atomic DRAFT→RUNNING transition. updateMany returns count; if 0, the
  // cycle was already past DRAFT (concurrent run, completed, or failed).
  const claimed = await prisma.cycle.updateMany({
    where: { id, status: "DRAFT" },
    data: { status: "RUNNING" },
  });
  if (claimed.count === 0) {
    return NextResponse.json(
      { error: "Cycle is not in DRAFT state." },
      { status: 409 },
    );
  }

  const firmId = session.firmId;
  const projectId = cycle.hypothesis.projectId;
  const question = cycle.hypothesis.content;

  // Background-safe execution. The response returns immediately; the panel
  // run, transcript persistence, synthesize, and final Cycle update all
  // run as a detached promise. The client polls /status to learn when
  // status flips to COMPLETE or FAILED.
  void (async () => {
    try {
      const client = await getAnthropicClientForFirm(firmId);
      const panel = await runPanelAsk(question, client, firmId, projectId);

      const successCount = panel.responses.filter((r) => !r.apiError).length;
      const failedTooMany = successCount / panel.responses.length < 0.5;

      // Persist transcripts (everything that came back — partial > nothing).
      await prisma.syntheticTranscript.createMany({
        data: panel.responses.map((r) => ({
          cycleId: id,
          personaKey: r.agentKey,
          personaName: r.name,
          personaRegion: r.region,
          paragraphs: r.reasoning
            ? r.reasoning
                .split(/\n+/)
                .map((p) => p.trim())
                .filter(Boolean)
            : [],
          themeIds: [],
          rawResponse: {
            verdict: r.verdict,
            sentiment: r.sentiment,
            headline: r.headline,
            reasoning: r.reasoning,
            rawText: r.rawText,
            parseError: r.parseError,
            apiError: r.apiError,
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
          } as unknown as Prisma.InputJsonValue,
        })),
      });

      if (failedTooMany) {
        await prisma.cycle.update({
          where: { id },
          data: {
            status: "FAILED",
            failedReason: `${panel.responses.length - successCount}/${panel.responses.length} agents failed`,
            totalPersonas: panel.responses.length,
            durationSec: Math.round(panel.durationMs / 1000),
            llmCostUsd: new Prisma.Decimal(
              computeCostUsd(panel.totalInputTokens, panel.totalOutputTokens).toFixed(4),
            ),
            completedAt: new Date(),
          },
        });
        return;
      }

      // Synthesize exec summary from the panel result.
      let summary: Awaited<ReturnType<typeof synthesizePanel>> | null = null;
      try {
        summary = await synthesizePanel(
          question,
          panel.responses,
          panel.aggregates,
          client,
        );
      } catch (e) {
        console.warn(
          `[cycle ${id}] synthesize failed:`,
          e instanceof Error ? e.message : String(e),
        );
      }

      const totalInput =
        panel.totalInputTokens + (summary?.inputTokens ?? 0);
      const totalOutput =
        panel.totalOutputTokens + (summary?.outputTokens ?? 0);
      const totalDurationSec = Math.round(
        (panel.durationMs + (summary?.durationMs ?? 0)) / 1000,
      );

      await prisma.cycle.update({
        where: { id },
        data: {
          status: "COMPLETE",
          totalPersonas: panel.responses.length,
          durationSec: totalDurationSec,
          llmCostUsd: new Prisma.Decimal(
            computeCostUsd(totalInput, totalOutput).toFixed(4),
          ),
          summaryText: summary?.summary ?? null,
          topPros: (summary?.topPros ?? []) as unknown as Prisma.InputJsonValue,
          topCons: (summary?.topCons ?? []) as unknown as Prisma.InputJsonValue,
          insights:
            (summary?.insights ?? []) as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 240) : "unknown";
      console.error(`[cycle ${id}] run failed:`, msg);
      await prisma.cycle
        .update({
          where: { id },
          data: {
            status: "FAILED",
            failedReason: msg,
            completedAt: new Date(),
          },
        })
        .catch(() => {});
    }
  })();

  return NextResponse.json({ cycleId: id, status: "RUNNING" });
}
