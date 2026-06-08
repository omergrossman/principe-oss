// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireRole("PRINCIPE_ADMIN");
  const { id } = await params;

  const transcript = await prisma.transcript.findFirst({
    where: { id, firmId: session.firmId },
    include: {
      insights: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!transcript) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ transcript });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireRole("PRINCIPE_ADMIN");
  const { id } = await params;
  const existing = await prisma.transcript.findFirst({
    where: { id, firmId: session.firmId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  // Cascade deletes insights via FK. Persona-level contributions remain
  // until admin triggers recompute (which won't find this transcript and
  // will strip its contributions).
  await prisma.transcript.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
