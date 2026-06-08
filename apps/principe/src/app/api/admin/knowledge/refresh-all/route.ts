// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-auth";
import { kickoffRefreshAll, getRefreshStatus } from "@/lib/sources/bulk-fetch";

export async function POST() {
  const session = await requireRole("PRINCIPE_ADMIN");
  kickoffRefreshAll(session.firmId);
  const status = await getRefreshStatus(session.firmId);
  return NextResponse.json({ ok: true, ...status });
}

export async function GET() {
  const session = await requireRole("PRINCIPE_ADMIN");
  const status = await getRefreshStatus(session.firmId);
  return NextResponse.json(status);
}
