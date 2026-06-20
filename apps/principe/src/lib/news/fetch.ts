// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  getUpdatesMode,
  getUpdatesBaseUrl,
} from "@/lib/updates/manifest";
import { verifyManifestSignature } from "@/lib/updates/verify";
import { isNewsFeed, type NewsFeed } from "./schema";

/**
 * News delivery rides the same env + transport as knowledge updates:
 *   - "disabled" → the whole updates subsystem is off; no news checks.
 *   - "local"    → no remote host; the app shows whatever's already in the
 *                  DB (e.g. seeded), never reaching out.
 *   - "remote"   → fetch + verify <base>/news.json against its detached
 *                  ed25519 signature, using the SAME publisher key as the
 *                  knowledge bundle (verifyManifestSignature is a generic
 *                  detached-signature check over raw bytes).
 */
export function getNewsMode(): "remote" | "local" | "disabled" {
  return getUpdatesMode();
}

export class NewsFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NewsFetchError";
  }
}

/**
 * Fetch + verify + parse the signed news feed. Throws NewsFetchError (or
 * InvalidSignatureError from verify) on any failure — callers decide
 * whether that's loud (an explicit "Check now") or quiet (background poll).
 *
 * SECURITY: the signature is verified over the EXACT bytes received before
 * any JSON parse, so a tampered news.json is rejected before its contents
 * are trusted. The body is display-only content (never executed), but it
 * still rides the signed channel so a self-hoster's trust boundary is the
 * same single publisher key for both knowledge and news.
 */
export async function fetchNewsFeed(): Promise<NewsFeed> {
  const base = getUpdatesBaseUrl();
  const [docRes, sigRes] = await Promise.all([
    fetch(`${base}/news.json`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }),
    fetch(`${base}/news.json.sig`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }),
  ]);

  if (!docRes.ok) {
    throw new NewsFetchError(`news.json returned HTTP ${docRes.status}`);
  }
  if (!sigRes.ok) {
    throw new NewsFetchError(`news.json.sig returned HTTP ${sigRes.status}`);
  }

  const docBytes = Buffer.from(await docRes.arrayBuffer());
  const sigBytes = Buffer.from(await sigRes.arrayBuffer());

  // Throws InvalidSignatureError if the bytes don't verify.
  verifyManifestSignature(docBytes, sigBytes);

  let parsed: unknown;
  try {
    parsed = JSON.parse(docBytes.toString("utf8"));
  } catch {
    throw new NewsFetchError("news.json is not valid JSON");
  }
  if (!isNewsFeed(parsed)) {
    throw new NewsFetchError("news.json has an invalid shape");
  }
  return parsed;
}
