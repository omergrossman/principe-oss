// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { prisma } from "@/lib/db/prisma";

const MAX_LEN = 60;

export async function PATCH(req: NextRequest) {
  const session = await requireAuth("/profile");
  const body = await req.json().catch(() => ({}));
  const raw = typeof body?.displayName === "string" ? body.displayName.trim() : "";
  if (!raw) {
    return NextResponse.json(
      { error: "Display name can't be empty." },
      { status: 400 },
    );
  }
  if (raw.length > MAX_LEN) {
    return NextResponse.json(
      { error: `Display name is too long (max ${MAX_LEN} characters).` },
      { status: 400 },
    );
  }
  await prisma.user.update({
    where: { id: session.userId },
    data: { name: raw },
  });
  return NextResponse.json({ ok: true, displayName: raw });
}
