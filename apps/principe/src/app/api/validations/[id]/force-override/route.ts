import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSession, isReAuthFresh } from "@/lib/session";

// Force-override of a FAIL verdict. AC: re-auth must be fresh (< 5 min);
// the override is logged with the reason text, and the validation row is
// marked permanently. The cycle (when run in Sprint 3) inherits the
// "STATISTICALLY INVALID" label from this flag.
//
// Returns 409 (Conflict) if re-auth is stale — the client redirects the
// user to /re-auth?next=... to refresh, then retries.

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!isReAuthFresh(session)) {
    return NextResponse.json(
      { error: "Re-authentication required.", needsReAuth: true },
      { status: 409 },
    );
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 10) {
    return NextResponse.json(
      { error: "Override reason must be at least 10 characters." },
      { status: 400 },
    );
  }
  if (reason.length > 2000) {
    return NextResponse.json(
      { error: "Override reason exceeds 2000 characters." },
      { status: 400 },
    );
  }

  const existing = await prisma.hypothesisValidation.findUnique({
    where: { id },
    select: { id: true, kind: true, hypothesis: { select: { createdById: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Validation not found." }, { status: 404 });
  }
  if (existing.hypothesis.createdById !== session.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (existing.kind !== "FAIL") {
    return NextResponse.json(
      { error: "Only FAIL verdicts can be force-overridden." },
      { status: 400 },
    );
  }

  const [updated] = await prisma.$transaction([
    prisma.hypothesisValidation.update({
      where: { id },
      data: {
        forceOverridden: true,
        forceOverrideReason: reason,
      },
      select: {
        id: true,
        forceOverridden: true,
        forceOverrideReason: true,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorId: session.userId,
        action: "validation.force_override",
        resourceType: "HypothesisValidation",
        resourceId: id,
        metadata: { reason, verdictKind: existing.kind },
      },
    }),
  ]);

  return NextResponse.json({ validation: updated });
}
