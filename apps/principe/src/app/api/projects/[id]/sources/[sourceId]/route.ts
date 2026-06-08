// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";
import { fetchUrlAsText } from "@/lib/sources/fetch";
import { kickoffPendingFetches } from "@/lib/sources/bulk-fetch";
import { fireAndForgetDistill } from "@/lib/sources/distill";
import { appendEvolutionForSource } from "@/lib/projects/evolution";

const SOURCE_RESPONSE_FIELDS = {
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
} as const;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> },
) {
  const session = await requireRole("VC_ADMIN", "PRINCIPE_ADMIN");
  const { id, sourceId } = await params;
  const body = await req.json().catch(() => ({}));

  const existing = await prisma.knowledgeSource.findFirst({
    where: {
      id: sourceId,
      firmId: session.firmId,
      projectId: id,
    },
    select: { id: true, url: true, kind: true, isCurated: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (body.action === "refresh") {
    if (existing.kind !== "URL" || !existing.url) {
      return NextResponse.json(
        { error: "Only URL sources can be refreshed." },
        { status: 400 },
      );
    }
    try {
      const fetched = await fetchUrlAsText(existing.url);
      await prisma.knowledgeSource.update({
        where: { id: sourceId },
        data: {
          content: fetched.text,
          contentHash: fetched.contentHash,
          publishedAt: fetched.publishedAt ?? undefined,
          lastFetchedAt: new Date(),
          lastFetchError: null,
        },
      });
      void appendEvolutionForSource(sourceId).catch(() => {});
      fireAndForgetDistill(sourceId);
      return NextResponse.json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 240) : "unknown";
      await prisma.knowledgeSource.update({
        where: { id: sourceId },
        data: { lastFetchError: msg, lastFetchedAt: new Date() },
      });
      return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    }
  }

  if (typeof body.enabled === "boolean") {
    const updated = await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { enabled: body.enabled },
      select: { id: true, enabled: true },
    });
    return NextResponse.json({ source: updated });
  }

  const updateData: {
    title?: string;
    category?: string;
    region?: string;
    url?: string;
    content?: null;
    contentHash?: null;
    publishedAt?: null;
    lastFetchedAt?: null;
    lastFetchError?: null;
  } = {};

  if (typeof body.title === "string") {
    const t = body.title.trim();
    if (!t) {
      return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
    }
    updateData.title = t;
  }
  if (typeof body.category === "string") updateData.category = body.category.trim();
  if (typeof body.region === "string") updateData.region = body.region.trim();

  if (typeof body.url === "string") {
    if (existing.kind !== "URL") {
      return NextResponse.json(
        { error: "Only URL sources have a URL." },
        { status: 400 },
      );
    }
    const newUrl = body.url.trim();
    if (!/^https?:\/\//i.test(newUrl)) {
      return NextResponse.json(
        { error: "URL must start with http(s)://" },
        { status: 400 },
      );
    }
    if (newUrl !== existing.url) {
      updateData.url = newUrl;
      updateData.content = null;
      updateData.contentHash = null;
      updateData.publishedAt = null;
      updateData.lastFetchedAt = null;
      updateData.lastFetchError = null;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "Unsupported patch body." }, { status: 400 });
  }

  if (existing.isCurated) {
    return NextResponse.json(
      { error: "Curated sources cannot be edited." },
      { status: 400 },
    );
  }

  try {
    const source = await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: updateData,
      select: SOURCE_RESPONSE_FIELDS,
    });
    if (updateData.url) kickoffPendingFetches(session.firmId);
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

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> },
) {
  const session = await requireRole("VC_ADMIN", "PRINCIPE_ADMIN");
  const { id, sourceId } = await params;
  const existing = await prisma.knowledgeSource.findFirst({
    where: {
      id: sourceId,
      firmId: session.firmId,
      projectId: id,
    },
    select: { id: true, isCurated: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (existing.isCurated) {
    return NextResponse.json(
      { error: "Curated sources can be disabled but not deleted." },
      { status: 400 },
    );
  }
  await prisma.knowledgeSource.delete({ where: { id: sourceId } });
  return NextResponse.json({ ok: true });
}
