// SPDX-License-Identifier: AGPL-3.0-or-later
// Publisher tool: build a signed knowledge bundle.
//
// Usage:
//   PRINCIPE_UPDATES_PRIVATE_KEY_PATH=./updates-private.pem \
//   pnpm tsx scripts/build-bundle.ts <version> <input-dir> <output-dir>
//
// Example:
//   pnpm tsx scripts/build-bundle.ts 2026-W23 ./calibration ./dist/updates
//
// Outputs (next to each other inside <output-dir>):
//   bundles/<version>.tar.gz
//   manifests/<version>.json
//   manifests/<version>.json.sig   (64 raw bytes, ed25519 detached)
//   latest.json                    (copy of the new manifest)
//   latest.json.sig                (copy of the new sig)
//
// Upload <output-dir> to whatever static host you control (S3 + CDN,
// Cloudflare R2, even a GitHub Pages branch). The consumer fetches
// <PRINCIPE_UPDATES_URL>/latest.json + <PRINCIPE_UPDATES_URL>/latest.json.sig
// at check-time, plus <PRINCIPE_UPDATES_URL>/<bundlePath> at install.

import crypto from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, basename } from "node:path";
import * as tar from "tar";

function sha256Hex(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

interface ManifestEntry {
  type: "knowledge" | "calibration" | "persona";
  path: string;
  sha256: string;
  bytes: number;
  id: string;
  // Optional news-feed targeting metadata, merged in (pre-signing) from
  // an optional `feed-metadata.json` at the input root. Keyed by entry
  // path. Carried in the signed manifest so it's tamper-protected, and
  // written onto the KnowledgeSource row by the consumer's applyBundle.
  region?: string;
  industries?: string[];
  category?: string;
  publishedAt?: string;
}

interface FeedMetadata {
  region?: string;
  industries?: string[];
  category?: string;
  publishedAt?: string;
}

/**
 * Load the optional `feed-metadata.json` (a map of entry path → targeting
 * metadata) from the input root. Absent file → empty map (pre-feed
 * bundles build exactly as before).
 */
function loadFeedMetadata(inputDir: string): Record<string, FeedMetadata> {
  const path = join(inputDir, "feed-metadata.json");
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, FeedMetadata>;
  return parsed && typeof parsed === "object" ? parsed : {};
}

function classify(relPath: string): ManifestEntry["type"] | null {
  if (relPath.startsWith("knowledge/")) return "knowledge";
  if (relPath.startsWith("datasets/")) return "calibration";
  if (relPath.startsWith("personas/")) return "persona";
  return null;
}

function walk(root: string, prefix = ""): { abs: string; rel: string }[] {
  const out: { abs: string; rel: string }[] = [];
  for (const name of readdirSync(root)) {
    const abs = join(root, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      out.push(...walk(abs, rel));
    } else if (stat.isFile()) {
      out.push({ abs, rel });
    }
  }
  return out;
}

async function main() {
  const [, , version, inputDir, outputDir] = process.argv;
  if (!version || !inputDir || !outputDir) {
    console.error("Usage: pnpm tsx scripts/build-bundle.ts <version> <input-dir> <output-dir>");
    process.exit(2);
  }

  const keyPath = process.env.PRINCIPE_UPDATES_PRIVATE_KEY_PATH;
  if (!keyPath || !existsSync(keyPath)) {
    console.error("PRINCIPE_UPDATES_PRIVATE_KEY_PATH must point to an ed25519 PEM private key");
    console.error("(generate one with: pnpm tsx scripts/generate-keypair.ts)");
    process.exit(2);
  }
  const privateKey = crypto.createPrivateKey({
    key: readFileSync(keyPath),
    format: "pem",
  });

  console.log(`[build-bundle] version=${version} input=${inputDir} output=${outputDir}`);

  // 1. Walk input dir, build per-file metadata.
  const feedMeta = loadFeedMetadata(inputDir);
  const files = walk(inputDir);
  const entries: ManifestEntry[] = [];
  for (const f of files) {
    const type = classify(f.rel);
    if (!type) {
      console.log(`  skip (unknown type): ${f.rel}`);
      continue;
    }
    const bytes = readFileSync(f.abs);
    const entry: ManifestEntry = {
      type,
      path: f.rel,
      sha256: sha256Hex(bytes),
      bytes: bytes.length,
      // Stable id = type:basename-without-ext. Keeps re-publishes idempotent
      // across the consumer's upsert-by-id apply.
      id: `${type}:${basename(f.rel).replace(/\.[^.]+$/, "")}`,
    };
    // Merge targeting metadata (pre-signing) for feed knowledge entries.
    const m = feedMeta[f.rel];
    if (m) {
      if (m.region !== undefined) entry.region = m.region;
      if (m.industries !== undefined) entry.industries = m.industries;
      if (m.category !== undefined) entry.category = m.category;
      if (m.publishedAt !== undefined) entry.publishedAt = m.publishedAt;
    }
    entries.push(entry);
  }
  console.log(`  ${entries.length} entries inventoried`);

  // 2. Build the tarball.
  mkdirSync(join(outputDir, "bundles"), { recursive: true });
  mkdirSync(join(outputDir, "manifests"), { recursive: true });

  const bundlePath = `bundles/${version}.tar.gz`;
  const bundleAbsPath = join(outputDir, bundlePath);
  await tar.create(
    {
      file: bundleAbsPath,
      gzip: true,
      cwd: inputDir,
    },
    entries.map((e) => e.path),
  );
  const bundleBytes = readFileSync(bundleAbsPath);
  const bundleSha = sha256Hex(bundleBytes);
  console.log(`  bundle written: ${bundleAbsPath} (${bundleBytes.length} bytes, sha256=${bundleSha.slice(0, 12)}…)`);

  // 3. Build + write manifest.
  const manifest = {
    manifestVersion: 1,
    version,
    createdAt: new Date().toISOString(),
    bundleSha256: bundleSha,
    bundleBytes: bundleBytes.length,
    bundlePath,
    changelog: `Auto-built from ${relative(process.cwd(), inputDir)}`,
    entries,
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
  const manifestPath = join(outputDir, "manifests", `${version}.json`);
  writeFileSync(manifestPath, manifestBytes);
  console.log(`  manifest written: ${manifestPath}`);

  // 4. Sign + write signature.
  const signature = crypto.sign(null, manifestBytes, privateKey);
  const sigPath = `${manifestPath}.sig`;
  writeFileSync(sigPath, signature);
  console.log(`  signature written: ${sigPath} (${signature.length} bytes)`);

  // 5. Update latest.json + latest.json.sig (the consumer's entry point).
  writeFileSync(join(outputDir, "latest.json"), manifestBytes);
  writeFileSync(join(outputDir, "latest.json.sig"), signature);
  console.log(`  latest.json updated`);

  console.log("");
  console.log("Upload <output-dir> to your static host and the consumers' /api/updates/check");
  console.log("calls will pick it up. PRINCIPE_UPDATES_URL on each consumer points at the URL");
  console.log("that serves <output-dir>'s contents.");
}

main().catch((e) => {
  console.error("[build-bundle] FAILED", e);
  process.exit(1);
});
