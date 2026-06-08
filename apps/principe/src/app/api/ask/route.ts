// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAnthropicClientForFirm } from "@/lib/anthropic/client";
import { runPanelAsk } from "@/lib/ciso-panel/ask";
import { synthesizePanel } from "@/lib/ciso-panel/synthesize";
import {
  clearProgress,
  isRunActive,
  markRunEnd,
  markRunStart,
  markSynthesisDone,
  markSynthesisStarted,
  markValidationStarted,
  markValidationDone,
} from "@/lib/ciso-panel/progress";
import { resolveCurrentProject } from "@/lib/projects/bootstrap";
import { requestVerdict } from "@/lib/statistician/client";
import type { Verdict } from "@/lib/statistician/types";

const CONFIDENCE_BY_KIND: Record<Verdict, number> = {
  PASS: 95,
  WARN: 60,
  FAIL: 25,
};

export const maxDuration = 120;

// Haiku 4.5 list prices (USD per 1M tokens) — used to snapshot the
// cost of each ask at save time. Updated when Anthropic changes pricing.
const HAIKU_INPUT_PER_M = 0.8;
const HAIKU_OUTPUT_PER_M = 4.0;

const PROJECT_COOKIE = "principe_project_id";

export async function POST(req: Request) {
  const session = await requireAuth("/workspace");
  const body = await req.json().catch(() => ({}));
  const question =
    typeof body.question === "string" ? body.question.trim() : "";

  if (question.length < 8) {
    return NextResponse.json(
      { error: "Question must be at least 8 characters." },
      { status: 400 },
    );
  }
  if (question.length > 2000) {
    return NextResponse.json(
      { error: "Question must be 2000 characters or fewer." },
      { status: 400 },
    );
  }
  if (!session.firmId) {
    return NextResponse.json(
      { error: "Sign in to an organisation to run the panel." },
      { status: 403 },
    );
  }

  // Concurrent-run guard. A previous panel run for this firm might
  // still be fanning out 100 Anthropic calls. Allowing a second one
  // to start would (a) double the Anthropic rate-limit pressure, (b)
  // race on the in-process progress counters (surfacing as ">100%"
  // in the UI), and (c) leave the user staring at the orphaned older
  // result if they hit the back button. Reject fast with 409.
  if (isRunActive(session.firmId)) {
    return NextResponse.json(
      {
        error:
          "A previous question is still running for this workspace. Wait for it to finish, or refresh the page if you closed the previous tab.",
      },
      { status: 409 },
    );
  }
  markRunStart(session.firmId);
  // Reset any stale progress state from a previous run that ended
  // abnormally (server restart, browser closed mid-run, etc.).
  clearProgress(session.firmId);

  const cookieStore = await cookies();
  const requestedProjectId = cookieStore.get(PROJECT_COOKIE)?.value ?? null;
  const project = await resolveCurrentProject(
    session.firmId,
    requestedProjectId,
    session.userId,
  );

  let client;
  try {
    client = await getAnthropicClientForFirm(session.firmId);
  } catch (e) {
    if (e instanceof Error && e.message === "ANTHROPIC_KEY_MISSING") {
      return NextResponse.json(
        { error: "No Anthropic key configured. Add one in Settings." },
        { status: 412 },
      );
    }
    throw e;
  }

  try {
    const panel = await runPanelAsk(
      question,
      client,
      session.firmId,
      project.id,
    );

    markSynthesisStarted(session.firmId);
    let summary;
    try {
      summary = await synthesizePanel(
        question,
        panel.responses,
        panel.aggregates,
        client,
      );
    } catch (synthErr) {
      summary = {
        summary:
          "Synthesis pass failed — see the per-response drill-down for the raw 100 verdicts. " +
          (synthErr instanceof Error ? synthErr.message.slice(0, 200) : ""),
        topPros: [],
        topCons: [],
        insights: [],
        themes: [],
        inputTokens: 0,
        outputTokens: 0,
        durationMs: 0,
      };
    }
    markSynthesisDone(session.firmId);

    // Auto-save: persist the ProjectAsk row idempotently. costUsd is
    // a snapshot at save time using the current Haiku price table.
    const totalInput = panel.totalInputTokens + (summary.inputTokens ?? 0);
    const totalOutput = panel.totalOutputTokens + (summary.outputTokens ?? 0);
    const costUsd = new Prisma.Decimal(
      (totalInput / 1_000_000) * HAIKU_INPUT_PER_M +
        (totalOutput / 1_000_000) * HAIKU_OUTPUT_PER_M,
    ).toFixed(4);

    // Sprint 5.5 — hybrid validation. Run Statistician synchronously
    // after the panel completes; failures are silent (validation must
    // never block a successful panel result from rendering). The shape
    // we store mirrors HypothesisValidation but lives on the ProjectAsk
    // row so quick-asks get the same statistical-soundness signal as
    // formal hypotheses, without an opt-in click.
    // Sprint 6 — wrap with progress marks so the live progress UI can
    // render the ~1-3s validation wait as a real phase (previously
    // invisible under the "Rendering dashboard" placeholder).
    // Sprint 7 — compute per-stratum (region:stance) observations from
    // the panel run so the Statistician can fit a real Beta-Binomial
    // likelihood and produce a meaningful CI on the population agreement
    // rate. Without observations the CI is prior-predictive and the
    // CI-width gate is skipped (Sprint 6 behaviour).
    const observations = computeStratumObservations(panel.responses);

    markValidationStarted(session.firmId);
    // The Statistician client retries up to 5×60s (Story 04.1 contract).
    // We can't let that block the panel response — the V1 brief explicitly
    // says validation failures must never gate rendering. Cap the wait at
    // 15s so a cold-Modal/slow-network scenario degrades gracefully:
    // response renders with validation = { error: "timed out" } and the
    // progress UI advances past 95%.
    const VALIDATION_BUDGET_MS = 15_000;
    const validation = await Promise.race([
      runValidation(question, project.id, observations).catch(
        (e) => ({ error: e instanceof Error ? e.message : String(e) }),
      ),
      new Promise<{ error: string }>((resolve) =>
        setTimeout(
          () => resolve({ error: `validation timed out after ${VALIDATION_BUDGET_MS}ms` }),
          VALIDATION_BUDGET_MS,
        ),
      ),
    ]);
    markValidationDone(session.firmId);

    const saved = await prisma.projectAsk.create({
      data: {
        projectId: project.id,
        question,
        panelResult: panel.responses as unknown as Prisma.InputJsonValue,
        aggregates: panel.aggregates as unknown as Prisma.InputJsonValue,
        summary: {
          summary: summary.summary,
          topPros: summary.topPros,
          topCons: summary.topCons,
          insights: summary.insights,
          themes: summary.themes,
        } as unknown as Prisma.InputJsonValue,
        tokensIn: totalInput,
        tokensOut: totalOutput,
        costUsd: new Prisma.Decimal(costUsd),
        durationMs: panel.durationMs,
        validation: validation as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, createdAt: true },
    });

    return NextResponse.json({
      askId: saved.id,
      projectId: project.id,
      question,
      panel,
      summary,
      validation,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    // Release the concurrent-run lock immediately so the user can
    // submit a follow-up question right away. Defer progress cleanup
    // by 2s so the polling client gets one final "100%" frame before
    // the progress state disappears.
    markRunEnd(session.firmId!);
    setTimeout(() => clearProgress(session.firmId!), 2000);
  }
}

/**
 * Sprint 6 — read regionWeights off the project's composition JSON to
 * produce a `targetDistribution` for the Statistician. Returns undefined
 * for projects on the canonical default composition (Python's global
 * default already matches it). Tolerant to legacy / null shapes.
 */
function deriveTargetFromComposition(
  composition: unknown,
): { region: string; weight: number }[] | undefined {
  if (!composition || typeof composition !== "object") return undefined;
  const c = composition as Record<string, unknown>;
  const rw = c.regionWeights;
  if (!rw || typeof rw !== "object") return undefined;
  const entries = Object.entries(rw as Record<string, unknown>).filter(
    ([, v]) => typeof v === "number" && v > 0,
  );
  if (entries.length === 0) return undefined;
  return entries.map(([region, weight]) => ({
    region,
    weight: weight as number,
  }));
}

/**
 * Sprint 6 — industry analog of `deriveTargetFromComposition`. When the
 * project's composition.industries is a non-empty subset of the canonical
 * 24, the user has restricted the panel to specific industries — target
 * mirrors that intent (uniform weight across the chosen industries, since
 * the composition doesn't carry per-industry weights). Returns undefined
 * for projects with industries === [] (all 24, the default) so the server
 * computes no industry KL.
 */
function deriveIndustryTargetFromComposition(
  composition: unknown,
): { industry: string; weight: number }[] | undefined {
  if (!composition || typeof composition !== "object") return undefined;
  const c = composition as Record<string, unknown>;
  const inds = c.industries;
  if (!Array.isArray(inds) || inds.length === 0) return undefined;
  return inds
    .filter((i): i is string => typeof i === "string" && i.trim().length > 0)
    .map((industry) => ({ industry, weight: 1 }));
}

/**
 * Sprint 7 — aggregate panel responses into region:stance strata for the
 * Bayesian model. Returns an array of {stratum, pro/con/neutral counts, n}
 * suitable to send as `agreementObservations` to the Statistician.
 *
 * Stratum is "region:stance" — 7 × 4 = 28 cells at canonical N=100 (~3.5
 * personas/cell). The partial-pooled Beta-Binomial handles sparse cells.
 * Excludes API failures (no verdict from the LLM) but includes parse
 * errors (they're forced-neutral with parseError=true, valid data).
 */
function computeStratumObservations(
  responses: import("@/lib/ciso-panel/ask").PanelResponse[],
): { stratum: string; proCount: number; conCount: number; neutralCount: number; n: number }[] {
  const buckets = new Map<
    string,
    { pro: number; con: number; neutral: number; n: number }
  >();
  for (const r of responses) {
    if (r.apiError) continue; // no observation if the LLM didn't respond
    const key = `${r.region}:${r.stance}`;
    const b = buckets.get(key) ?? { pro: 0, con: 0, neutral: 0, n: 0 };
    if (r.verdict === "pro") b.pro += 1;
    else if (r.verdict === "con") b.con += 1;
    else b.neutral += 1;
    b.n += 1;
    buckets.set(key, b);
  }
  return Array.from(buckets.entries()).map(([stratum, b]) => ({
    stratum,
    proCount: b.pro,
    conCount: b.con,
    neutralCount: b.neutral,
    n: b.n,
  }));
}

async function runValidation(
  question: string,
  projectId: string,
  agreementObservations?: { stratum: string; proCount: number; conCount: number; neutralCount: number; n: number }[],
) {
  const [agents, projectRow] = await Promise.all([
    prisma.projectAgent.findMany({
      where: { projectId },
      select: { region: true, industry: true },
    }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { composition: true },
    }),
  ]);
  const regions = Array.from(
    new Set(agents.map((a) => a.region).filter((r) => r && r.trim())),
  );
  const industries = Array.from(
    new Set(agents.map((a) => a.industry).filter((i) => i && i.trim())),
  );

  // Sprint 5.5 — send real per-region persona counts so the Statistician's
  // KL divergence + posterior reflect actual panel composition instead of
  // the pre-5.5 uniform-weight fallback.
  const regionCounts = new Map<string, number>();
  for (const a of agents) {
    const r = a.region?.trim();
    if (!r) continue;
    regionCounts.set(r, (regionCounts.get(r) ?? 0) + 1);
  }
  const regionDistribution = Array.from(regionCounts.entries()).map(
    ([region, weight]) => ({ region, weight }),
  );

  // Sprint 6 — derive the TARGET from the project's intended composition.
  // A US-only project (composition.regionWeights = {us: 100}) implies the
  // user is asking about US CISOs — target is US-only, so a US-only panel
  // hits KL=0 and reads as PASS. Omitted when the project uses the
  // canonical default composition (composition column is null) — server
  // falls back to its global default which already matches the canonical
  // panel.
  const targetDistribution = deriveTargetFromComposition(projectRow?.composition);

  // Sprint 6 — industry symmetry. Panel + target derived from the actual
  // agent industries and the project's industries[] intent.
  const industryCounts = new Map<string, number>();
  for (const a of agents) {
    const i = a.industry?.trim();
    if (!i) continue;
    industryCounts.set(i, (industryCounts.get(i) ?? 0) + 1);
  }
  const industryDistribution = Array.from(industryCounts.entries()).map(
    ([industry, weight]) => ({ industry, weight }),
  );
  const targetIndustryDistribution = deriveIndustryTargetFromComposition(
    projectRow?.composition,
  );

  const verdict = await requestVerdict({
    panelComposition: {
      personaCount: agents.length,
      regions,
      industries,
    },
    hypothesisText: question,
    questionType: "open-discovery",
    regionDistribution,
    targetDistribution,
    industryDistribution,
    targetIndustryDistribution,
    agreementObservations,
  });

  return {
    verdict: verdict.verdict,
    confidence: CONFIDENCE_BY_KIND[verdict.verdict],
    klDivergence: verdict.klDivergence,
    bciLow: verdict.credibleInterval.low,
    bciHigh: verdict.credibleInterval.high,
    recommendedN: verdict.recommendedN,
    reasoningTrace: verdict.reasoningTrace,
    stub: verdict.stub,
    ranAt: new Date().toISOString(),
  };
}
