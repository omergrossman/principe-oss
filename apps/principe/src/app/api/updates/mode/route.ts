// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/updates/mode  { autoUpdate: boolean }
 *
 * Sets the instance's knowledge-update consent. Manual (false, default) =
 * available updates install only on an explicit "Update now". Automatic
 * (true) = available updates install on their own. Default manual so no
 * instance ever pulls a knowledge push without opt-in.
 */
export async function POST(req: Request) {
  await requireRole("VC_ADMIN", "PRINCIPE_ADMIN");

  let body: { autoUpdate?: unknown };
  try {
    body = (await req.json()) as { autoUpdate?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (typeof body.autoUpdate !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "autoUpdate must be a boolean" },
      { status: 400 },
    );
  }

  // Single-tenant OSS instance — the one workspace holds the preference.
  const workspace = await prisma.firm.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!workspace) {
    return NextResponse.json({ ok: false, error: "no workspace" }, { status: 404 });
  }
  await prisma.firm.update({
    where: { id: workspace.id },
    data: { autoUpdate: body.autoUpdate },
  });
  return NextResponse.json({ ok: true, autoUpdate: body.autoUpdate });
}
