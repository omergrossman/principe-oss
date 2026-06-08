// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";
import { fetchUrlAsText } from "@/lib/sources/fetch";
import { fireAndForgetDistill } from "@/lib/sources/distill";
import { appendEvolutionForSource } from "@/lib/projects/evolution";

/**
 * Project-scoped knowledge sources.
 *
 * GET — lists sources where projectId = this project. Note these are
 *       IN ADDITION to firm-wide sources; the briefing builder loads
 *       both pools at fan-out time.
 *
 * POST — adds a URL source scoped to this project. Fetches inline,
 *       stores text content, kicks off evolution append.
 */

async function getProjectIfOwned(
  firmId: string,
  id: string,
): Promise<{ id: string } | null> {
  return prisma.project.findFirst({
    where: { id, firmId, status: "ACTIVE" },
    select: { id: true },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireRole("VC_ADMIN", "PRINCIPE_ADMIN");
  const { id } = await params;
  const project = await getProjectIfOwned(session.firmId, id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const sources = await prisma.knowledgeSource.findMany({
    where: { firmId: session.firmId, projectId: id },
    orderBy: [{ category: "asc" }, { title: "asc" }],
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireRole("VC_ADMIN", "PRINCIPE_ADMIN");
  const { id } = await params;
  const project = await getProjectIfOwned(session.firmId, id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const category =
    typeof body.category === "string" ? body.category.trim() : "custom";
  const region =
    typeof body.region === "string" ? body.region.trim() : "global";

  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: "URL must start with http(s)://" },
      { status: 400 },
    );
  }

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
        projectId: id,
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
    void appendEvolutionForSource(source.id).catch(() => {});
    fireAndForgetDistill(source.id);
    return NextResponse.json({ source });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "That URL is already in this project's sources." },
        { status: 409 },
      );
    }
    throw e;
  }
}
