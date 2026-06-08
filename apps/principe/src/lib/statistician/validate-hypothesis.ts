// Sprint 6 — shared Statistician validation logic extracted from
// /api/hypotheses/[id]/validate/route.ts. Used by both the legacy
// validate endpoint and the consolidated /api/cycles/create endpoint
// (which runs validation inline as part of Run, removing the
// pre-flight Validate click — see Sprint 6 retro).

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  PayloadTooLargeError,
  StatisticianBadRequest,
  StatisticianContractViolation,
  StatisticianUnavailable,
  requestVerdict,
} from "./client";
import type { Verdict, VerdictResponse } from "./types";

const CONFIDENCE_BY_KIND: Record<Verdict, number> = {
  PASS: 95,
  WARN: 60,
  FAIL: 25,
};

/**
 * Run a Statistician validation against a Hypothesis and persist the
 * resulting HypothesisValidation row.
 *
 * Returns the created validation row plus a normalised error tag when
 * the Statistician was unreachable / refused the payload. The caller
 * decides whether to surface as 400/502/503 (legacy validate endpoint)
 * or to fall back to a stub-shaped record (cycles/create — Sprint 6
 * trade-off: a transient Statistician outage shouldn't block the user
 * from running their cycle).
 */
export async function validateHypothesisAndPersist(args: {
  hypothesisId: string;
  hypothesisContent: string;
  hypothesisMode: "TEST" | "DISCOVERY";
  projectId: string;
  createdById: string;
}): Promise<
  | { ok: true; validationId: string; verdict: string; stubMode: boolean }
  | { ok: false; status: number; error: string; detail?: unknown }
> {
  const [agents, projectRow] = await Promise.all([
    prisma.projectAgent.findMany({
      where: { projectId: args.projectId },
      select: { region: true, industry: true },
    }),
    prisma.project.findUnique({
      where: { id: args.projectId },
      select: { composition: true },
    }),
  ]);

  const regions = Array.from(
    new Set(agents.map((a) => a.region).filter((r) => r && r.trim())),
  );
  const industries = Array.from(
    new Set(agents.map((a) => a.industry).filter((i) => i && i.trim())),
  );

  const regionCounts = new Map<string, number>();
  for (const a of agents) {
    const r = a.region?.trim();
    if (!r) continue;
    regionCounts.set(r, (regionCounts.get(r) ?? 0) + 1);
  }
  const regionDistribution = Array.from(regionCounts.entries()).map(
    ([region, weight]) => ({ region, weight }),
  );

  const industryCounts = new Map<string, number>();
  for (const a of agents) {
    const i = a.industry?.trim();
    if (!i) continue;
    industryCounts.set(i, (industryCounts.get(i) ?? 0) + 1);
  }
  const industryDistribution = Array.from(industryCounts.entries()).map(
    ([industry, weight]) => ({ industry, weight }),
  );

  const targetDistribution = deriveRegionTarget(projectRow?.composition);
  const targetIndustryDistribution = deriveIndustryTarget(
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
      hypothesisText: args.hypothesisContent,
      questionType:
        args.hypothesisMode === "TEST" ? "hypothesis-test" : "open-discovery",
      regionDistribution,
      targetDistribution,
      industryDistribution,
      targetIndustryDistribution,
    });
  } catch (e) {
    if (e instanceof PayloadTooLargeError) {
      return {
        ok: false,
        status: 413,
        error: "Hypothesis or panel composition exceeds Statistician size cap.",
      };
    }
    if (e instanceof StatisticianBadRequest) {
      return {
        ok: false,
        status: 400,
        error: "Statistician rejected the request.",
        detail: e.detail,
      };
    }
    if (e instanceof StatisticianContractViolation) {
      return {
        ok: false,
        status: 502,
        error: "Statistician contract violation.",
        detail: e.message,
      };
    }
    if (e instanceof StatisticianUnavailable) {
      return {
        ok: false,
        status: 503,
        error: "Validation service unavailable; retrying.",
        detail: { attempts: e.attempts },
      };
    }
    throw e;
  }

  const saved = await prisma.hypothesisValidation.create({
    data: {
      hypothesisId: args.hypothesisId,
      createdById: args.createdById,
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
    select: { id: true, kind: true, stubMode: true },
  });

  return {
    ok: true,
    validationId: saved.id,
    verdict: saved.kind,
    stubMode: saved.stubMode,
  };
}

function deriveRegionTarget(
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

function deriveIndustryTarget(
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
