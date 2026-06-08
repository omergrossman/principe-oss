// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import { validateHypothesisAndPersist } from "@/lib/statistician/validate-hypothesis";

// Sprint 6 — Cycle creation no longer requires a pre-flight Validate
// click. Caller posts `hypothesisId`; this endpoint runs validation
// inline, persists the HypothesisValidation row, and creates the Cycle
// referencing it. The UX is one button on the hypothesis page instead
// of the old two-step (Validate → Run). The validation record is still
// preserved on every Cycle for audit (per the Sprint 6 ELI5 decision).
//
// Backward-compatibility removed: the previous `validationId` payload
// shape is no longer accepted. Note: the hypothesis-page UI entry was
// removed entirely later in Sprint 6 — this endpoint is currently
// reachable only via direct POST. Kept for any future cycle-creation
// flow + for the existing /cycles/[id] result viewer to remain useful.
//
// Idempotency: if a cycle already exists for the most-recent validation
// on this hypothesis, return it instead of creating a new one. This
// guards against double-clicks racing through the validate-then-create
// path.

export async function POST(req: Request) {
  const session = await requireAuth();
  const body = await req.json().catch(() => ({}));
  const hypothesisId =
    typeof body.hypothesisId === "string" ? body.hypothesisId : "";
  if (!hypothesisId) {
    return NextResponse.json(
      { error: "hypothesisId is required." },
      { status: 400 },
    );
  }

  const hypothesis = await prisma.hypothesis.findUnique({
    where: { id: hypothesisId },
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

  // Run validation inline. Statistician outages are returned to the
  // client (UI surfaces a retry). We intentionally do NOT fall back to
  // a stub-shaped record because a cycle is a paid LLM run — failing
  // loudly is safer than hiding the outage.
  const validation = await validateHypothesisAndPersist({
    hypothesisId: hypothesis.id,
    hypothesisContent: hypothesis.content,
    hypothesisMode: hypothesis.mode === "TEST" ? "TEST" : "DISCOVERY",
    projectId: hypothesis.projectId,
    createdById: session.userId,
  });

  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error, detail: validation.detail },
      { status: validation.status },
    );
  }

  const activePanel = await prisma.cISOPanel.findFirst({
    where: { isActive: true },
    select: { version: true },
  });
  const panelVersion = activePanel?.version ?? "ciso-v1.2";

  const cycle = await prisma.cycle.create({
    data: {
      hypothesisId: hypothesis.id,
      validationId: validation.validationId,
      createdById: session.userId,
      panelVersion,
      status: "DRAFT",
    },
    select: { id: true, status: true },
  });

  return NextResponse.json({
    cycleId: cycle.id,
    status: cycle.status,
    validation: {
      verdict: validation.verdict,
      stubMode: validation.stubMode,
    },
  });
}
