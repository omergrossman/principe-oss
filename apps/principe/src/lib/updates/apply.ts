// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { BundleManifest, BundleEntry } from "./manifest";

/**
 * Apply a verified bundle to the local database.
 *
 * Only `knowledge` entries hit the DB — calibration and persona payloads
 * ship baked into the relevant container images (statistician + principe),
 * so updating those means a redeploy. A future Sprint can extend this to
 * write calibration/personas at runtime; for now the runtime apply path
 * is knowledge-only.
 *
 * SNAPSHOT SEMANTICS (news feed). A bundle is the full current set of
 * feed knowledge, not an incremental delta. After upserting every entry
 * in the bundle, any pre-existing feed row (kind = BUNDLE) whose id is
 * absent from this bundle is removed. This makes BOTH lifecycle rules
 * fall out of one mechanism, with no per-row TTL logic on the instance:
 *   - Expiry        — an event past its TTL simply isn't in tomorrow's
 *                     bundle, so it's removed here.
 *   - Supersession  — a foundational report that replaces an earlier one
 *                     ships under the SAME stable id → upsert-in-place.
 *
 * Per-id idempotency within the bundle:
 *   - Same id + same contentHash → "skipped" (already installed).
 *   - Same id + new contentHash  → "updated".
 *   - New id                     → "new".
 *
 * SECURITY INVARIANT: removal is hard-scoped to `kind = BUNDLE`. The
 * calibration baseline (kind TEXT, baked into the image), every user
 * upload, and every baseline-pushdown row are structurally untouchable
 * — an empty or hostile-but-signed bundle can never wipe the baseline.
 * (Assumes one curated feed per instance, per PRINCIPE_UPDATES_URL — all
 * BUNDLE rows originate from that single feed's successive bundles.)
 *
 * Bundle contents are passed as a Map<path, Buffer> already unpacked
 * from the tarball by the caller, keeping this layer pure + testable.
 */

export interface ApplyResult {
  knowledge: { new: number; updated: number; skipped: number; removed: number };
  failed: { id: string; reason: string }[];
}

export async function applyBundle(
  manifest: BundleManifest,
  files: Map<string, Buffer>,
  firmId: string,
): Promise<ApplyResult> {
  const result: ApplyResult = {
    knowledge: { new: 0, updated: 0, skipped: 0, removed: 0 },
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

  result.knowledge.removed = await pruneAbsentFeedEntries(manifest, firmId);

  return result;
}

/**
 * Snapshot prune — remove this firm's feed rows (kind = BUNDLE) whose id
 * is not present in the bundle. Hard delete is safe: no foreign key
 * references KnowledgeSource.id, and TTL'd feed content should not
 * accumulate as soft-deleted rows.
 *
 * GUARD: only prune when the bundle actually carries knowledge entries.
 * A bundle with zero knowledge entries (calibration-only, or a malformed
 * publish) must NOT be read as "the feed is now empty" and wipe every
 * feed row. The id-scope (kind = BUNDLE) already protects the baseline;
 * this guard additionally protects the feed from an accidental empty
 * publish.
 */
async function pruneAbsentFeedEntries(
  manifest: BundleManifest,
  firmId: string,
): Promise<number> {
  const knowledgeIds = manifest.entries
    .filter((e) => e.type === "knowledge")
    .map((e) => e.id);

  if (knowledgeIds.length === 0) return 0;

  const removed = await prisma.knowledgeSource.deleteMany({
    where: {
      firmId,
      kind: "BUNDLE",
      id: { notIn: knowledgeIds },
    },
  });
  return removed.count;
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

  // Feed-targeting metadata from the (signed) manifest entry. The briefing
  // scorer reads `region`, `applicableIndustries`, `category`, and recency
  // (`publishedAt`/`lastFetchedAt`) to surface an entry for matching
  // personas. Absent fields → a general, untargeted entry.
  //
  // `industries` maps onto the existing `applicableIndustries` Json column
  // (an array the scorer matches case-insensitively against persona
  // industry). Prisma.DbNull explicitly clears it on update so a
  // superseding report that drops its industry tag doesn't keep a stale one.
  const industries =
    Array.isArray(entry.industries) && entry.industries.length > 0
      ? entry.industries
      : undefined;
  const applicableIndustries = industries ?? Prisma.DbNull;
  const region = entry.region ?? null;
  const category = entry.category ?? null;
  const publishedAt = entry.publishedAt ? new Date(entry.publishedAt) : null;

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
      category,
      region,
      applicableIndustries,
      publishedAt,
      isCurated: true,
      lastFetchedAt: new Date(),
      fetchEnabled: false, // bundles aren't re-fetched
    },
    update: {
      title,
      content,
      contentHash: entry.sha256,
      category,
      region,
      applicableIndustries,
      publishedAt,
      lastFetchedAt: new Date(),
    },
  });

  return existing ? "updated" : "new";
}
