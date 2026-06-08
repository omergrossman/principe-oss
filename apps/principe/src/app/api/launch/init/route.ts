// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ensureAgenticPanel } from "@/lib/personas/seed-panel";
import { getSession } from "@/lib/session";
import { getAnthropicClientForFirm } from "@/lib/anthropic/client";
import {
  isStaleBeyond,
  kickoffPendingFetches,
  kickoffRefreshAll,
  getRefreshStatus,
} from "@/lib/sources/bulk-fetch";

/**
 * Launch-page bootstrap. Idempotent.
 *
 * 1. Seeds the 100-agent panel (no-op if already seeded).
 * 2. If the knowledge base hasn't been refreshed in >7 days, kicks off
 *    a parallel bulk re-fetch in the background. Otherwise just fills
 *    in any sources that don't have content yet.
 * 3. Pings the firm's Anthropic key.
 *
 * (OSS distribution: the DP-master baseline-sync step from the SaaS
 * donor was removed in Sprint 8. Knowledge bundles arrive via the
 * Sprint 9 signed-update pipeline once it ships.)
 *
 * The launch splash UI polls this endpoint until `sources.refreshing`
 * goes false, then redirects.
 */

const STALE_DAYS = 7;

export interface LaunchInitResult {
  panel: { created: boolean; personaCount: number };
  sources: {
    seeded: boolean;
    refreshing: boolean;
    pending: number;
  };
  anthropic: {
    state: "skipped-no-auth" | "skipped-no-key" | "ok" | "error";
    error?: string;
    latencyMs?: number;
  };
  authed: boolean;
  destination: "/projects" | "/login" | "/setup";
}

export async function POST(): Promise<NextResponse<LaunchInitResult>> {
  // OSS first-run gate: if the database has zero users, route the
  // visitor to /setup instead of /login. (First-run setup happens via
  // the /setup wizard; there is no env-driven bootstrap in OSS.)
  const userCount = await prisma.user.count();
  const setupComplete = userCount > 0;

  const session = await getSession();
  const seed = await ensureAgenticPanel();

  const result: LaunchInitResult = {
    panel: { created: seed.created, personaCount: seed.personaCount },
    sources: { seeded: false, refreshing: false, pending: 0 },
    anthropic: { state: "skipped-no-auth" },
    authed: Boolean(session),
    destination: !setupComplete ? "/setup" : session ? "/projects" : "/login",
  };

  if (!session?.firmId) {
    return NextResponse.json(result);
  }

  // Knowledge sources — staleness-driven refresh. The OSS distribution
  // bundles a baseline knowledge set at install time (calibration/) and
  // Sprint 9 will add signed updates. For now, if any URL-kind sources
  // landed without content (or were last fetched > STALE_DAYS ago) the
  // bulk-fetch worker scrapes them in the background.
  if (await needsFirstFill(session.firmId)) {
    kickoffPendingFetches(session.firmId);
  } else if (await isStaleBeyond(session.firmId, STALE_DAYS)) {
    kickoffRefreshAll(session.firmId);
  }
  const srcStatus = await getRefreshStatus(session.firmId);
  result.sources.refreshing = srcStatus.active;
  result.sources.pending = srcStatus.pending;

  // Anthropic ping.
  const firm = await prisma.firm.findUnique({
    where: { id: session.firmId },
    select: { anthropicKeyLast4: true },
  });
  if (!firm?.anthropicKeyLast4) {
    result.anthropic.state = "skipped-no-key";
    return NextResponse.json(result);
  }

  const started = Date.now();
  try {
    const client = await getAnthropicClientForFirm(session.firmId);
    await client.models.list({ limit: 1 });
    result.anthropic.state = "ok";
    result.anthropic.latencyMs = Date.now() - started;
  } catch (e) {
    result.anthropic.state = "error";
    result.anthropic.error =
      e instanceof Error ? e.message.slice(0, 160) : "unknown";
    result.anthropic.latencyMs = Date.now() - started;
  }

  return NextResponse.json(result);
}

async function needsFirstFill(firmId: string): Promise<boolean> {
  // Are there URL sources that have never been fetched?
  const count = await prisma.knowledgeSource.count({
    where: {
      firmId,
      kind: "URL",
      content: null,
      lastFetchedAt: null,
      fetchEnabled: true,
    },
  });
  return count > 0;
}
