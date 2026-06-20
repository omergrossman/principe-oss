// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";
import { getNewsMode, fetchNewsFeed } from "@/lib/news/fetch";

export const dynamic = "force-dynamic";

/**
 * GET /api/news/check
 *
 * Admin-only. Reports the installed news version vs the latest published
 * version, mirroring /api/updates/check. The signed news.json is small,
 * so we fetch + verify it here to read the latest version/count; the
 * actual DB apply happens in /api/news/install.
 *
 * Modes (shared PRINCIPE_UPDATES_URL):
 *   - "disabled" → returns { mode: "disabled" }, Settings hides the card.
 *   - "local"    → no remote host; whatever's in the DB is current.
 *   - "remote"   → fetch + verify <base>/news.json.
 */
export interface NewsCheckResponse {
  mode: "remote" | "local" | "disabled";
  installedVersion: string | null;
  latestVersion: string | null;
  latestGeneratedAt: string | null;
  latestCount: number | null;
  updateAvailable: boolean;
  autoNews: boolean;
  error?: string;
}

export async function GET() {
  await requireRole("VC_ADMIN", "PRINCIPE_ADMIN");

  const mode = getNewsMode();
  const firm = await prisma.firm.findFirst({
    orderBy: { createdAt: "asc" },
    select: { newsVersion: true, autoNews: true },
  });

  const base: NewsCheckResponse = {
    mode,
    installedVersion: firm?.newsVersion ?? null,
    latestVersion: null,
    latestGeneratedAt: null,
    latestCount: null,
    updateAvailable: false,
    autoNews: firm?.autoNews ?? true,
  };

  if (mode !== "remote") {
    return NextResponse.json(base);
  }

  try {
    const feed = await fetchNewsFeed();
    return NextResponse.json({
      ...base,
      latestVersion: feed.version,
      latestGeneratedAt: feed.generatedAt,
      latestCount: feed.items.length,
      updateAvailable: feed.version !== base.installedVersion,
    });
  } catch (e) {
    // Unreachable/not-yet-published endpoint → treat as "nothing new"
    // rather than a scary error on every Settings load. Signature/parse
    // failures are real and surfaced.
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (e instanceof Error && e.name === "InvalidSignatureError") {
      return NextResponse.json({ ...base, error: msg }, { status: 502 });
    }
    console.warn(`[news/check] ${msg.slice(0, 160)}`);
    return NextResponse.json(base);
  }
}
