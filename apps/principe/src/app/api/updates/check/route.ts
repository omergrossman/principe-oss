// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";
import {
  getUpdatesMode,
  getUpdatesBaseUrl,
  isBundleManifest,
  type BundleManifest,
} from "@/lib/updates/manifest";

export const dynamic = "force-dynamic";

/**
 * GET /api/updates/check
 *
 * Queries the configured update endpoint for the latest manifest,
 * returns the installed version + latest version + diff summary.
 *
 * Three modes (set via PRINCIPE_UPDATES_URL env):
 *   - "disabled" → endpoint returns { mode: "disabled" }, UI hides the button
 *   - unset      → "local" mode, no remote check, "you're up to date"
 *   - URL set    → "remote" mode, fetches <URL>/latest.json
 *
 * No signature verification happens here — that's enforced in /install.
 * This endpoint is read-only and safe to poll.
 */

export interface UpdatesCheckResponse {
  mode: "remote" | "local" | "disabled";
  installedVersion: string | null;
  installedAt: string | null;
  // When no bundle has been pulled yet, this is the workspace's
  // creation date — i.e. when the bundled-with-install knowledge
  // baseline first landed. UI shows "Last update: <date>" in that
  // case instead of "none yet."
  workspaceCreatedAt: string | null;
  latestVersion: string | null;
  latestPublishedAt: string | null;
  changelog: string | null;
  updateAvailable: boolean;
  // Manual (false, default) vs automatic (true) update consent.
  autoUpdate: boolean;
  error?: string;
}

export async function GET() {
  await requireRole("VC_ADMIN", "PRINCIPE_ADMIN");

  const mode = getUpdatesMode();

  const lastInstall = await prisma.bundleInstall.findFirst({
    orderBy: { installedAt: "desc" },
    select: { version: true, installedAt: true },
  });

  const workspace = await prisma.firm.findFirst({
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, autoUpdate: true },
  });

  const base: UpdatesCheckResponse = {
    mode,
    installedVersion: lastInstall?.version ?? null,
    installedAt: lastInstall?.installedAt.toISOString() ?? null,
    workspaceCreatedAt: workspace?.createdAt.toISOString() ?? null,
    latestVersion: null,
    latestPublishedAt: null,
    changelog: null,
    updateAvailable: false,
    autoUpdate: workspace?.autoUpdate ?? false,
  };

  if (mode !== "remote") {
    return NextResponse.json(base);
  }

  // Remote mode — fetch the manifest.
  try {
    const baseUrl = getUpdatesBaseUrl();
    const res = await fetch(`${baseUrl}/latest.json`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { ...base, error: `update endpoint returned HTTP ${res.status}` },
        { status: 502 },
      );
    }
    const parsed: unknown = await res.json();
    if (!isBundleManifest(parsed)) {
      return NextResponse.json(
        { ...base, error: "update endpoint returned an invalid manifest shape" },
        { status: 502 },
      );
    }
    const manifest = parsed as BundleManifest;
    return NextResponse.json({
      ...base,
      latestVersion: manifest.version,
      latestPublishedAt: manifest.createdAt,
      changelog: manifest.changelog,
      updateAvailable: manifest.version !== base.installedVersion,
    });
  } catch (e) {
    // Network-level failures (DNS, connection refused, timeout) are
    // common during the OSS publisher's bootstrap phase — the URL is
    // pre-configured in compose, but updates.principe.cloud may not
    // be live yet. Treat these as "no update available right now"
    // instead of surfacing a scary error on every Settings load.
    // Real server errors (4xx/5xx with response) are still loud — see
    // the `!res.ok` branch above.
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.warn(`[updates/check] endpoint unreachable: ${msg.slice(0, 160)}`);
    return NextResponse.json(base);
  }
}
