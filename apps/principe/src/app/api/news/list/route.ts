// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/news/list
 *
 * Any signed-in user. Returns the current news items (newest first) plus a
 * per-user unread flag derived from User.lastNewsSeenAt (the high-water
 * mark): an item is unread when its date is newer than lastNewsSeenAt, or
 * when the user has never opened the feed. Display-only, so it's not
 * admin-gated — every member sees the same items, each with their own
 * unread state.
 */
export interface NewsListItem {
  id: string;
  date: string;
  tag: string;
  channel: string;
  title: string;
  summary: string | null;
  body: string;
  link: string | null;
  kind: string | null;
  unread: boolean;
}

export interface NewsListResponse {
  items: NewsListItem[];
  unreadCount: number;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const [user, rows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { lastNewsSeenAt: true },
    }),
    prisma.newsItem.findMany({
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { date: "desc" },
    }),
  ]);

  const seenAt = user?.lastNewsSeenAt ?? null;
  let unreadCount = 0;
  const items: NewsListItem[] = rows.map((r) => {
    const unread = seenAt === null || r.date.getTime() > seenAt.getTime();
    if (unread) unreadCount += 1;
    return {
      id: r.id,
      date: r.date.toISOString().slice(0, 10),
      tag: r.tag,
      channel: r.channel,
      title: r.title,
      summary: r.summary,
      body: r.body,
      link: r.link,
      kind: r.kind,
      unread,
    };
  });

  return NextResponse.json({ items, unreadCount } satisfies NewsListResponse);
}
