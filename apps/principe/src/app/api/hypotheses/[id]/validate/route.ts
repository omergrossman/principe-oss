import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import {
  PayloadTooLargeError,
  StatisticianBadRequest,
  StatisticianContractViolation,
  StatisticianUnavailable,
  requestVerdict,
} from "@/lib/statistician/client";
import type { Verdict, VerdictResponse } from "@/lib/statistician/types";

// Sprint 2 — pre-cycle validation. Cycle creation still hangs off the
// Sprint 1 portcoId chain (dead in V1), so verdicts persist against the
// Hypothesis until Sprint 3 reshapes Cycle.
//
// On any Statistician failure we DO NOT persist a row. Silent PASS is
// forbidden by the V1 brief; a missing verdict surfaces as "service
// unavailable" on the client.

const CONFIDENCE_BY_KIND: Record<Verdict, number> = {
  PASS: 95,
  WARN: 60,
  FAIL: 25,
};

/**
 * Sprint 6 — derive a `targetDistribution` from the project's intended
 * composition (same shape as /api/ask/route.ts). Returns undefined for
 * projects on the canonical default composition so Python uses its
 * global default.
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
 * Sprint 6 — industry analog of `deriveTargetFromComposition`. See
 * /api/ask/route.ts for the full rationale.
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth();
  const { id } = await params;

  const hypothesis = await prisma.hypothesis.findUnique({
    where: { id },
    select: {
      id: true,
      content: true,
      mode: true,
      createdById: true,
      projectId: true,
    },
  });
  if (!hypothesis) {
    return NextResponse.json({ error: "Hypothesis not found." }, { status: 404 });
  }
  if (hypothesis.createdById !== session.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!hypothesis.projectId) {
    return NextResponse.json(
      { error: "Hypothesis is not attached to a project." },
      { status: 400 },
    );
  }

  // Build panel composition from the project's persisted agents. We aggregate
  // here (rather than counting on the Statistician to do it) so the verdict
  // is reproducible from server-side state — useful when the audit viewer
  // shows the trace months later.
  const [agents, projectRow] = await Promise.all([
    prisma.projectAgent.findMany({
      where: { projectId: hypothesis.projectId },
      select: { region: true, industry: true },
    }),
    prisma.project.findUnique({
      where: { id: hypothesis.projectId },
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
  // KL divergence + posterior reflect actual panel composition.
  const regionCounts = new Map<string, number>();
  for (const a of agents) {
    const r = a.region?.trim();
    if (!r) continue;
    regionCounts.set(r, (regionCounts.get(r) ?? 0) + 1);
  }
  const regionDistribution = Array.from(regionCounts.entries()).map(
    ([region, weight]) => ({ region, weight }),
  );

  // Sprint 6 — target inferred from project composition (US-only project
  // → US-only target, etc.). See ask/route.ts for the rationale.
  const targetDistribution = deriveTargetFromComposition(projectRow?.composition);

  // Sprint 6 — industry symmetry.
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

  let verdict: VerdictResponse;
  try {
    verdict = await requestVerdict({
      panelComposition: {
        personaCount: agents.length,
        regions,
        industries,
      },
      hypothesisText: hypothesis.content,
      questionType: hypothesis.mode === "TEST" ? "hypothesis-test" : "open-discovery",
      regionDistribution,
      targetDistribution,
      industryDistribution,
      targetIndustryDistribution,
    });
  } catch (e) {
    if (e instanceof PayloadTooLargeError) {
      return NextResponse.json(
        { error: "Hypothesis or panel composition exceeds Statistician size cap." },
        { status: 413 },
      );
    }
    if (e instanceof StatisticianBadRequest) {
      return NextResponse.json(
        { error: "Statistician rejected the request.", detail: e.detail },
        { status: 400 },
      );
    }
    if (e instanceof StatisticianContractViolation) {
      // 502 because the contract-violating peer is the Statistician,
      // not the caller. Surface to the UI as a service error.
      return NextResponse.json(
        { error: "Statistician contract violation.", message: e.message },
        { status: 502 },
      );
    }
    if (e instanceof StatisticianUnavailable) {
      return NextResponse.json(
        { error: "Validation service unavailable; retrying.", attempts: e.attempts },
        { status: 503 },
      );
    }
    throw e;
  }

  const saved = await prisma.hypothesisValidation.create({
    data: {
      hypothesisId: hypothesis.id,
      createdById: session.userId,
      kind: verdict.verdict,
      confidenceScore: CONFIDENCE_BY_KIND[verdict.verdict],
      klDivergence: verdict.klDivergence,
      bciLow: verdict.credibleInterval.low,
      bciHigh: verdict.credibleInterval.high,
      recommendedN: verdict.recommendedN,
      stubMode: verdict.stub,
      reasoning: {
        reasoningTrace: verdict.reasoningTrace,
        perStratumRepresentation: verdict.perStratumRepresentation,
        panelComposition: {
          personaCount: agents.length,
          regions,
          industries,
        },
      } as unknown as Prisma.InputJsonValue,
    },
    select: {
      id: true,
      kind: true,
      confidenceScore: true,
      klDivergence: true,
      bciLow: true,
      bciHigh: true,
      recommendedN: true,
      stubMode: true,
      reasoning: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ validation: saved });
}
