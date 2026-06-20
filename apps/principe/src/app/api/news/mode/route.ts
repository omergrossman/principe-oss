// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/news/mode  { autoNews: boolean }
 *
 * Sets the instance's news-update consent. Automatic (true, default) =
 * available news installs on its own. Manual (false) = news installs only
 * on an explicit "Update now". Mirrors /api/updates/mode.
 */
export async function POST(req: Request) {
  await requireRole("VC_ADMIN", "PRINCIPE_ADMIN");

  let body: { autoNews?: unknown };
  try {
    body = (await req.json()) as { autoNews?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (typeof body.autoNews !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "autoNews must be a boolean" },
      { status: 400 },
    );
  }

  const firm = await prisma.firm.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!firm) {
    return NextResponse.json({ ok: false, error: "no workspace" }, { status: 404 });
  }
  await prisma.firm.update({
    where: { id: firm.id },
    data: { autoNews: body.autoNews },
  });
  return NextResponse.json({ ok: true, autoNews: body.autoNews });
}
