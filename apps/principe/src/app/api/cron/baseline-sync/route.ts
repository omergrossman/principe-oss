import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { syncBaselineFromDp } from "@/lib/baseline-sync/sync";

/**
 * GET /api/cron/baseline-sync — nightly tenant-side baseline pull.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`. Vercel Cron forwards
 * that header automatically when scheduled via vercel.json.
 *
 * Iterates every active firm (there's effectively one per Principe
 * instance, but the loop is correct regardless) and runs
 * syncBaselineFromDp for each. Cheap-check makes this a 50-byte ping
 * in steady state.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured." },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const firms = await prisma.firm.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true },
  });
  const results = [];
  for (const f of firms) {
    const r = await syncBaselineFromDp({ firmId: f.id });
    results.push({ firmId: f.id, name: f.name, ...r });
  }
  return NextResponse.json({
    sweptAt: new Date().toISOString(),
    firms: results,
  });
}
