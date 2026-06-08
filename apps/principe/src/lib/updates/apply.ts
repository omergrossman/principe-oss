// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { BundleManifest, BundleEntry } from "./manifest";

/**
 * Apply a verified bundle to the local database.
 *
 * Only `knowledge` entries hit the DB in Sprint 9 — calibration and
 * persona payloads ship baked into the relevant container images
 * (statistician + principe), so updating those means a redeploy. A
 * future Sprint can extend this to write calibration/personas at
 * runtime if we want runtime hot-swap, but for now bundles are
 * knowledge-only for the runtime apply path.
 *
 * Idempotency:
 *   - Each entry has a stable `id`. We upsert by id.
 *   - Same id + same contentHash → "skipped" (already installed).
 *   - Same id + new contentHash  → "updated".
 *   - New id                     → "new".
 *
 * Bundle contents are passed as a Map<path, Buffer> already unpacked
 * from the tarball by the caller. This keeps the apply layer pure
 * (no tar/gzip dependencies) and easy to test.
 */

export interface ApplyResult {
  knowledge: { new: number; updated: number; skipped: number };
  failed: { id: string; reason: string }[];
}

export async function applyBundle(
  manifest: BundleManifest,
  files: Map<string, Buffer>,
  firmId: string,
): Promise<ApplyResult> {
  const result: ApplyResult = {
    knowledge: { new: 0, updated: 0, skipped: 0 },
    failed: [],
  };

  for (const entry of manifest.entries) {
    if (entry.type !== "knowledge") continue;

    const bytes = files.get(entry.path);
    if (!bytes) {
      result.failed.push({
        id: entry.id,
        reason: `bundle missing entry file: ${entry.path}`,
      });
      continue;
    }

    try {
      const disposition = await applyKnowledgeEntry(entry, bytes, firmId);
      result.knowledge[disposition] += 1;
    } catch (e) {
      result.failed.push({
        id: entry.id,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return result;
}

async function applyKnowledgeEntry(
  entry: BundleEntry,
  bytes: Buffer,
  firmId: string,
): Promise<"new" | "updated" | "skipped"> {
  // Verify the unpacked bytes match the per-entry hash committed in the
  // (signed) manifest. The bundle-level sha256 is already checked before
  // unpacking, but verifying each entry makes the manifest's per-entry hash
  // load-bearing — a build/packaging step that diverged file content from its
  // advertised hash is rejected rather than silently installed.
  const actualSha = createHash("sha256").update(bytes).digest("hex");
  if (actualSha !== entry.sha256) {
    throw new Error(
      `content hash mismatch for ${entry.path} (expected ${entry.sha256.slice(0, 12)}…, got ${actualSha.slice(0, 12)}…)`,
    );
  }

  const content = bytes.toString("utf8");
  const title = entry.path.split("/").pop()?.replace(/\.md$/, "") ?? entry.path;

  const existing = await prisma.knowledgeSource.findUnique({
    where: { id: entry.id },
    select: { contentHash: true },
  });

  if (existing && existing.contentHash === entry.sha256) {
    return "skipped";
  }

  await prisma.knowledgeSource.upsert({
    where: { id: entry.id },
    create: {
      id: entry.id,
      firmId,
      kind: "BUNDLE",
      title,
      description: `bundle entry: ${entry.path}`,
      content,
      contentHash: entry.sha256,
      isCurated: true,
      lastFetchedAt: new Date(),
      fetchEnabled: false, // bundles aren't re-fetched
    },
    update: {
      title,
      content,
      contentHash: entry.sha256,
      lastFetchedAt: new Date(),
    },
  });

  return existing ? "updated" : "new";
}
