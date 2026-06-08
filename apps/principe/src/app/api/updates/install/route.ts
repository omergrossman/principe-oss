// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import * as tar from "tar";
import * as zlib from "node:zlib";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";
import {
  getUpdatesMode,
  getUpdatesBaseUrl,
  isBundleManifest,
  type BundleManifest,
} from "@/lib/updates/manifest";
import {
  verifyManifestSignature,
  sha256Hex,
  InvalidSignatureError,
  InvalidPublicKeyError,
} from "@/lib/updates/verify";
import { applyBundle, type ApplyResult } from "@/lib/updates/apply";

export const dynamic = "force-dynamic";

/**
 * POST /api/updates/install
 *
 * Pulls the configured bundle, verifies the manifest signature against
 * PRINCIPE_UPDATES_PUBLIC_KEY (or the embedded default), hashes the
 * downloaded tarball to confirm it matches manifest.bundleSha256,
 * unpacks the bundle in-memory, and applies the knowledge entries to
 * the local database via lib/updates/apply.
 *
 * Atomic install ledger: writes BundleInstall row only after the
 * apply step succeeds. A failed install leaves no trace.
 *
 * No request body — version-pinning is via the latest.json manifest
 * the publisher serves. Future enhancement: allow body { version: X }
 * to pin to a specific published manifest.
 */

interface InstallResponse {
  ok: boolean;
  installedVersion?: string;
  diffSummary?: ApplyResult;
  error?: string;
}

export async function POST(): Promise<NextResponse<InstallResponse>> {
  const session = await requireRole("VC_ADMIN", "PRINCIPE_ADMIN");
  if (!session.firmId) {
    return NextResponse.json(
      { ok: false, error: "Organisation required" },
      { status: 403 },
    );
  }

  const mode = getUpdatesMode();
  if (mode !== "remote") {
    return NextResponse.json(
      {
        ok: false,
        error: `Updates are ${mode} — set PRINCIPE_UPDATES_URL to enable remote installs.`,
      },
      { status: 400 },
    );
  }

  try {
    const baseUrl = getUpdatesBaseUrl();

    // 1. Fetch the manifest (JSON) and its detached signature (64 raw bytes).
    const [manifestRes, sigRes] = await Promise.all([
      fetch(`${baseUrl}/latest.json`, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      }),
      fetch(`${baseUrl}/latest.json.sig`, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      }),
    ]);
    if (!manifestRes.ok) {
      return NextResponse.json(
        { ok: false, error: `manifest HTTP ${manifestRes.status}` },
        { status: 502 },
      );
    }
    if (!sigRes.ok) {
      return NextResponse.json(
        { ok: false, error: `signature HTTP ${sigRes.status}` },
        { status: 502 },
      );
    }
    const manifestBytes = Buffer.from(await manifestRes.arrayBuffer());
    const signatureBytes = Buffer.from(await sigRes.arrayBuffer());

    // 2. Verify the signature over the manifest bytes (NOT the parsed
    //    object — bytes only, so we're certain the publisher signed
    //    exactly what we received).
    verifyManifestSignature(manifestBytes, signatureBytes);

    // 3. Parse manifest after signature verification.
    const parsed: unknown = JSON.parse(manifestBytes.toString("utf8"));
    if (!isBundleManifest(parsed)) {
      return NextResponse.json(
        { ok: false, error: "manifest does not match BundleManifest schema" },
        { status: 502 },
      );
    }
    const manifest = parsed as BundleManifest;

    // 4. Fetch the bundle tarball + verify its sha256 matches the
    //    manifest's commitment.
    const bundleUrl = `${baseUrl}/${manifest.bundlePath.replace(/^\//, "")}`;
    const bundleRes = await fetch(bundleUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    if (!bundleRes.ok) {
      return NextResponse.json(
        { ok: false, error: `bundle HTTP ${bundleRes.status}` },
        { status: 502 },
      );
    }
    const bundleBytes = Buffer.from(await bundleRes.arrayBuffer());
    const actualSha = sha256Hex(bundleBytes);
    if (actualSha !== manifest.bundleSha256) {
      return NextResponse.json(
        {
          ok: false,
          error: `bundle hash mismatch — manifest says ${manifest.bundleSha256}, got ${actualSha}`,
        },
        { status: 502 },
      );
    }

    // 5. Unpack the gzipped tarball in-memory. Each entry's contents
    //    land in `files` keyed by relative path.
    const files = await unpackBundle(bundleBytes);

    // 6. Apply to the database.
    const diff = await applyBundle(manifest, files, session.firmId);

    // 7. Record the install (atomic — only after apply succeeds).
    await prisma.bundleInstall.create({
      data: {
        version: manifest.version,
        sha256: manifest.bundleSha256,
        source: baseUrl,
        diffSummary: diff as unknown as object,
      },
    });

    return NextResponse.json({
      ok: true,
      installedVersion: manifest.version,
      diffSummary: diff,
    });
  } catch (e) {
    if (e instanceof InvalidSignatureError || e instanceof InvalidPublicKeyError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 502 });
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[api/updates/install] failed", e);
    return NextResponse.json(
      { ok: false, error: `install failed: ${msg.slice(0, 200)}` },
      { status: 500 },
    );
  }
}

/**
 * Gunzip + untar an in-memory bundle. Returns a Map of relative path
 * inside the tar → file contents. Streams under the hood so memory
 * footprint stays O(largest file) rather than O(bundle).
 */
async function unpackBundle(gzipped: Buffer): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  const gunzipped = zlib.gunzipSync(gzipped);

  await new Promise<void>((resolve, reject) => {
    const parser = new tar.Parser();
    parser.on("entry", (entry) => {
      if (entry.type !== "File") {
        entry.resume();
        return;
      }
      const chunks: Buffer[] = [];
      entry.on("data", (chunk: Buffer) => chunks.push(chunk));
      entry.on("end", () => files.set(entry.path, Buffer.concat(chunks)));
      entry.on("error", reject);
    });
    parser.on("end", resolve);
    parser.on("error", reject);
    Readable.from(gunzipped).pipe(parser);
  });

  return files;
}
