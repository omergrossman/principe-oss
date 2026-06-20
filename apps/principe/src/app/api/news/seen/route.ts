// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/news/seen
 *
 * Any signed-in user. "Mark all read" — advances this user's
 * lastNewsSeenAt high-water mark to now, clearing every unread dot. Unread
 * state is strictly per-user: one member marking read never affects
 * another.
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { lastNewsSeenAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
