// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";
import { getNewsMode, fetchNewsFeed } from "@/lib/news/fetch";
import { applyNews } from "@/lib/news/apply";

export const dynamic = "force-dynamic";

/**
 * POST /api/news/install
 *
 * Admin-only. Fetches + verifies the signed news feed and applies it to
 * the NewsItem table (snapshot semantics). Records the installed version
 * on the workspace so /check can report "up to date".
 */
export async function POST() {
  await requireRole("VC_ADMIN", "PRINCIPE_ADMIN");

  if (getNewsMode() !== "remote") {
    return NextResponse.json(
      { ok: false, error: "news updates are not configured on this instance" },
      { status: 400 },
    );
  }

  try {
    const feed = await fetchNewsFeed();
    const diff = await applyNews(feed);

    const firm = await prisma.firm.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (firm) {
      await prisma.firm.update({
        where: { id: firm.id },
        data: { newsVersion: feed.version },
      });
    }

    return NextResponse.json({ ok: true, version: feed.version, diff });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
