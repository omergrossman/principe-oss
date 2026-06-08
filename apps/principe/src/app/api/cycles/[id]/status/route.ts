import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";

// Lightweight polling endpoint for the Cycle Result UI. Returns only the
// fields the page needs to decide whether to keep polling.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth();
  const { id } = await params;

  const cycle = await prisma.cycle.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      createdById: true,
      totalPersonas: true,
      failedReason: true,
      completedAt: true,
      _count: { select: { transcripts: true } },
    },
  });
  if (!cycle) {
    return NextResponse.json({ error: "Cycle not found." }, { status: 404 });
  }
  if (cycle.createdById !== session.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return NextResponse.json({
    cycleId: cycle.id,
    status: cycle.status,
    transcriptCount: cycle._count.transcripts,
    totalPersonas: cycle.totalPersonas,
    failedReason: cycle.failedReason,
    completedAt: cycle.completedAt,
  });
}
