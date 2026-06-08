// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";
import { fireAndForgetDistillTranscript } from "@/lib/transcripts/distill";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireRole("PRINCIPE_ADMIN");
  const { id } = await params;
  const transcript = await prisma.transcript.findFirst({
    where: { id, firmId: session.firmId },
    select: { id: true },
  });
  if (!transcript) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  fireAndForgetDistillTranscript(id);
  return NextResponse.json({ ok: true, status: "PENDING" });
}
