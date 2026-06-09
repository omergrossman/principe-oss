// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Knowledge bundle manifest — the JSON sidecar that ships next to each
 * signed bundle tarball. Pinning the schema here so the consumer
 * (this app) and the publisher (scripts/build-bundle.ts) stay in sync.
 *
 * On-disk layout when published:
 *
 *   updates.principe.cloud/
 *     latest.json                  → redirects to a versioned manifest
 *     manifests/2026-W23.json      → the manifest
 *     manifests/2026-W23.json.sig  → 64-byte ed25519 signature, raw bytes
 *     bundles/2026-W23.tar.gz      → the bundle tarball
 *
 * The manifest commits to the bundle's sha256 — once the manifest
 * signature verifies, the consumer hashes the downloaded bundle and
 * compares against `bundleSha256`. Both must match for the install to
 * proceed.
 */

export interface BundleManifest {
  /** Schema version of the manifest format itself (not the bundle). */
  manifestVersion: 1;
  /** Bundle version string. ISO date or "YYYY-Www" recommended. */
  version: string;
  /** ISO-8601 timestamp of when the publisher built the bundle. */
  createdAt: string;
  /** SHA-256 of the bundle tarball, hex-encoded (lowercase). */
  bundleSha256: string;
  /** Total bytes of the bundle tarball — used for download progress + sanity. */
  bundleBytes: number;
  /** Relative URL of the bundle, joined onto the configured updates base URL. */
  bundlePath: string;
  /** Human-readable summary of what changed in this bundle. */
  changelog: string;
  /** Per-entry inventory inside the bundle. Each entry's sha256 lets the
   * consumer verify granular content after unpacking. */
  entries: BundleEntry[];
}

export interface BundleEntry {
  /** What the consumer should do with this file. */
  type: "knowledge" | "calibration" | "persona";
  /** Path inside the tarball (e.g. "knowledge/nist-csf-2.0.md"). */
  path: string;
  /** Hex SHA-256 of the file contents (lowercase). */
  sha256: string;
  /** Bytes of the file contents. */
  bytes: number;
  /** Stable identifier for the entry — used as the DB primary key for
   * idempotent applies. Same id with a new sha256 = update; new id =
   * insert. For news-feed bundles the apply layer is snapshot-based:
   * a knowledge entry's id missing from a later bundle is REMOVED (see
   * applyBundle). A foundational analyst report that supersedes an
   * earlier one ships under the same stable id → upsert replaces it. */
  id: string;
  /**
   * Optional targeting metadata for news-feed knowledge entries. Carried
   * in the SIGNED manifest, so it's tamper-protected alongside the
   * content hash. The consumer writes these onto the KnowledgeSource row
   * so the existing briefing scorer (`scoreSource`: region +5,
   * applicableIndustries +4, recency) can surface the entry for matching
   * personas. All absent = a general, untargeted entry (current
   * behaviour for pre-feed bundles, which remain valid).
   */
  region?: string;
  industries?: string[];
  category?: string;
  /** ISO-8601 publication date — feeds recency ranking in the briefing. */
  publishedAt?: string;
}

export function isBundleManifest(x: unknown): x is BundleManifest {
  if (!x || typeof x !== "object") return false;
  const m = x as Record<string, unknown>;
  return (
    m.manifestVersion === 1 &&
    typeof m.version === "string" &&
    typeof m.createdAt === "string" &&
    typeof m.bundleSha256 === "string" &&
    /^[0-9a-f]{64}$/.test(m.bundleSha256) &&
    typeof m.bundleBytes === "number" &&
    typeof m.bundlePath === "string" &&
    typeof m.changelog === "string" &&
    Array.isArray(m.entries) &&
    m.entries.every(isBundleEntry)
  );
}

function isBundleEntry(x: unknown): x is BundleEntry {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  return (
    (e.type === "knowledge" || e.type === "calibration" || e.type === "persona") &&
    typeof e.path === "string" &&
    typeof e.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(e.sha256) &&
    typeof e.bytes === "number" &&
    typeof e.id === "string" &&
    // Optional feed-targeting metadata — absent on pre-feed bundles.
    (e.region === undefined || typeof e.region === "string") &&
    (e.industries === undefined ||
      (Array.isArray(e.industries) &&
        e.industries.every((i) => typeof i === "string"))) &&
    (e.category === undefined || typeof e.category === "string") &&
    (e.publishedAt === undefined || typeof e.publishedAt === "string")
  );
}

/**
 * Where to look for updates. Three modes:
 *   - "remote"   → env URL configured, hit it for the manifest
 *   - "local"    → no env, the calibration/ shipped in the repo IS the
 *                  latest available content (no updates to apply)
 *   - "disabled" → explicitly set to "disabled" via env to opt-out of
 *                  the whole subsystem (no /api/updates/check pings)
 */
export function getUpdatesMode(): "remote" | "local" | "disabled" {
  const v = (process.env.PRINCIPE_UPDATES_URL ?? "").trim();
  if (v.toLowerCase() === "disabled") return "disabled";
  if (v.length === 0) return "local";
  return "remote";
}

export function getUpdatesBaseUrl(): string {
  const v = process.env.PRINCIPE_UPDATES_URL?.trim();
  if (!v) throw new Error("PRINCIPE_UPDATES_URL is not set");
  return v.replace(/\/$/, "");
}
