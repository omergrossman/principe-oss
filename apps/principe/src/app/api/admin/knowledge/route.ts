// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";
import { kickoffPendingFetches } from "@/lib/sources/bulk-fetch";
import { fetchUrlAsText } from "@/lib/sources/fetch";
import { fireAndForgetDistill } from "@/lib/sources/distill";
import { appendEvolutionForSource } from "@/lib/projects/evolution";

export async function GET() {
  const session = await requireRole("PRINCIPE_ADMIN");
  // Baseline seeding now flows via the upstream baseline service's /api/baseline/v1 sync
  // (launch/init + nightly cron). This endpoint just lists whatever's
  // landed locally and re-kicks any pending fetches.
  kickoffPendingFetches(session.firmId);

  const sources = await prisma.knowledgeSource.findMany({
    where: { firmId: session.firmId, removedByFirm: false },
    orderBy: [
      { isCurated: "desc" },
      { category: "asc" },
      { title: "asc" },
    ],
    select: {
      id: true,
      kind: true,
      url: true,
      filename: true,
      title: true,
      description: true,
      category: true,
      region: true,
      isCurated: true,
      enabled: true,
      publishedAt: true,
      lastFetchedAt: true,
      lastFetchError: true,
      contentHash: true,
      addedAt: true,
    },
  });

  return NextResponse.json({ sources });
}

export async function POST(req: Request) {
  const session = await requireRole("PRINCIPE_ADMIN");
  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "custom";
  const region = typeof body.region === "string" ? body.region.trim() : "global";

  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "URL must start with http(s)://" }, { status: 400 });
  }

  // Fetch + extract on add. Failures are persisted as lastFetchError so the UI surfaces them.
  let fetched: Awaited<ReturnType<typeof fetchUrlAsText>> | null = null;
  let fetchError: string | null = null;
  try {
    fetched = await fetchUrlAsText(url);
  } catch (e) {
    fetchError = e instanceof Error ? e.message.slice(0, 240) : "unknown";
  }

  const finalTitle = title || fetched?.title || url;

  try {
    const source = await prisma.knowledgeSource.create({
      data: {
        firmId: session.firmId,
        kind: "URL",
        url,
        title: finalTitle,
        category,
        region,
        isCurated: false,
        enabled: true,
        content: fetched?.text ?? null,
        contentHash: fetched?.contentHash ?? null,
        publishedAt: fetched?.publishedAt ?? null,
        lastFetchedAt: fetched ? new Date() : null,
        lastFetchError: fetchError,
        fetchEnabled: true,
      },
      select: {
        id: true,
        kind: true,
        url: true,
        filename: true,
        title: true,
        description: true,
        category: true,
        region: true,
        isCurated: true,
        enabled: true,
        publishedAt: true,
        lastFetchedAt: true,
        lastFetchError: true,
        contentHash: true,
        addedAt: true,
      },
    });
    // Fire-and-forget: append evolution notes to matching agents.
    void appendEvolutionForSource(source.id).catch(() => {});
    fireAndForgetDistill(source.id);
    return NextResponse.json({ source });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "That URL is already in your sources." },
        { status: 409 },
      );
    }
    throw e;
  }
}
