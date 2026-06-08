// SPDX-License-Identifier: AGPL-3.0-or-later
import { prisma } from "@/lib/db/prisma";
import { fetchUrlAsText } from "./fetch";
import { fireAndForgetDistill } from "./distill";
import { appendEvolutionForSource } from "@/lib/projects/evolution";

/**
 * Background bulk-fetch for a firm's pending URL sources.
 *
 * Called by GET /api/settings/sources as a dangling promise — the
 * response returns immediately and the fetches run in parallel under
 * the request runtime. The UI polls until all rows have either content
 * or a recorded error.
 *
 * In-memory dedupe (`inProgress`) prevents two overlapping bulk runs
 * for the same firm if the user reloads /settings while a fetch is
 * mid-flight. Lost on server restart, which is fine — the worst case
 * is a duplicate kickoff that the per-row check below idempotently
 * handles.
 */

const inProgress = new Set<string>();

export interface RefreshStatus {
  active: boolean;
  pending: number;
}

export async function getRefreshStatus(firmId: string): Promise<RefreshStatus> {
  if (!inProgress.has(firmId)) {
    return { active: false, pending: 0 };
  }
  const pending = await prisma.knowledgeSource.count({
    where: {
      firmId,
      kind: "URL",
      content: null,
      fetchEnabled: true,
      lastFetchError: null,
    },
  });
  return { active: true, pending };
}

export function kickoffPendingFetches(firmId: string): void {
  if (inProgress.has(firmId)) return;
  inProgress.add(firmId);

  void (async () => {
    try {
      const pending = await prisma.knowledgeSource.findMany({
        where: {
          firmId,
          kind: "URL",
          content: null,
          fetchEnabled: true,
          lastFetchedAt: null,
          url: { not: null },
        },
        select: { id: true, url: true },
      });

      if (pending.length === 0) return;

      // Mark all rows "started" so a concurrent kickoff skips them.
      const startedAt = new Date();
      await prisma.knowledgeSource.updateMany({
        where: { id: { in: pending.map((p) => p.id) } },
        data: { lastFetchedAt: startedAt },
      });

      await Promise.allSettled(
        pending.map(async (s) => {
          try {
            const fetched = await fetchUrlAsText(s.url!);
            await prisma.knowledgeSource.update({
              where: { id: s.id },
              data: {
                content: fetched.text,
                contentHash: fetched.contentHash,
                publishedAt: fetched.publishedAt ?? undefined,
                lastFetchedAt: new Date(),
                lastFetchError: null,
              },
            });
            void appendEvolutionForSource(s.id).catch(() => {});
            fireAndForgetDistill(s.id);
          } catch (e) {
            await prisma.knowledgeSource.update({
              where: { id: s.id },
              data: {
                lastFetchError:
                  e instanceof Error ? e.message.slice(0, 240) : "unknown",
                lastFetchedAt: new Date(),
              },
            });
          }
        }),
      );
    } finally {
      inProgress.delete(firmId);
    }
  })();
}

/**
 * Force-refresh ALL URL sources for a firm (curated + user-added).
 * Used by the "Refresh all" button and by the weekly auto-refresh during
 * the launch splash. Identical kickoff semantics — fire-and-forget.
 */
export function kickoffRefreshAll(firmId: string): void {
  if (inProgress.has(firmId)) return;
  inProgress.add(firmId);

  void (async () => {
    try {
      const all = await prisma.knowledgeSource.findMany({
        where: {
          firmId,
          kind: "URL",
          fetchEnabled: true,
          url: { not: null },
        },
        select: { id: true, url: true },
      });
      if (all.length === 0) return;

      // Mark all as "started" so concurrent kickoff skips them.
      await prisma.knowledgeSource.updateMany({
        where: { id: { in: all.map((s) => s.id) } },
        data: { content: null, contentHash: null, lastFetchError: null, lastFetchedAt: new Date() },
      });

      await Promise.allSettled(
        all.map(async (s) => {
          try {
            const fetched = await fetchUrlAsText(s.url!);
            await prisma.knowledgeSource.update({
              where: { id: s.id },
              data: {
                content: fetched.text,
                contentHash: fetched.contentHash,
                publishedAt: fetched.publishedAt ?? undefined,
                lastFetchedAt: new Date(),
                lastFetchError: null,
              },
            });
            void appendEvolutionForSource(s.id).catch(() => {});
            fireAndForgetDistill(s.id);
          } catch (e) {
            await prisma.knowledgeSource.update({
              where: { id: s.id },
              data: {
                lastFetchError:
                  e instanceof Error ? e.message.slice(0, 240) : "unknown",
                lastFetchedAt: new Date(),
              },
            });
          }
        }),
      );
    } finally {
      inProgress.delete(firmId);
    }
  })();
}

/**
 * Was the firm's knowledge base last refreshed more than N days ago?
 * Treats "no sources yet" as fresh (the seed flow will populate them).
 */
export async function isStaleBeyond(
  firmId: string,
  days: number,
): Promise<boolean> {
  const newest = await prisma.knowledgeSource.findFirst({
    where: { firmId, kind: "URL", fetchEnabled: true, lastFetchedAt: { not: null } },
    orderBy: { lastFetchedAt: "desc" },
    select: { lastFetchedAt: true },
  });
  if (!newest?.lastFetchedAt) return false;
  const ageMs = Date.now() - newest.lastFetchedAt.getTime();
  return ageMs > days * 24 * 60 * 60 * 1000;
}
