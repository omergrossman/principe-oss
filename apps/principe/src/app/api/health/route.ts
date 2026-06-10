// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Liveness/readiness probe for the web service — used by the docker
// healthcheck, reverse proxies, and uptime monitors. Unauthenticated by
// design: it only reports whether the app can reach its database, never any
// tenant data. 200 when healthy, 503 when the DB is unreachable.
export const dynamic = "force-dynamic";

export async function GET() {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
  }
  return NextResponse.json(
    { status: db ? "ok" : "degraded", db, time: new Date().toISOString() },
    { status: db ? 200 : 503 },
  );
}
