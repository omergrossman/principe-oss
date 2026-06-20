// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * News feed schema — the signed `news.json` artifact published by
 * principe-feed alongside the knowledge bundle, on the same release host
 * (PRINCIPE_UPDATES_URL). It's the in-app counterpart of the website's
 * news.json: a snapshot of the current "What's New" items targeted at the
 * app channel.
 *
 * Delivery is independent of the knowledge bundle — its own file, its own
 * detached ed25519 signature (same publisher key), its own manual/auto
 * consent — so news (display content) and knowledge (panel reasoning
 * corpus) update on separate cadences.
 *
 *   <PRINCIPE_UPDATES_URL>/news.json        → this document
 *   <PRINCIPE_UPDATES_URL>/news.json.sig    → 64-byte ed25519 signature
 */

export type NewsTag =
  | "feature"
  | "calibration"
  | "security"
  | "release"
  | "research"
  | "tip";

/** What clicking the item does. Inferred by the publisher from `link`. */
export type NewsKind = "blog" | "external" | "video";

export interface NewsFeedItem {
  /** Stable id (feed-authored) — DB primary key for idempotent upsert. */
  id: string;
  /** Editorial date, YYYY-MM-DD. */
  date: string;
  tag: NewsTag;
  /** Always "app" or "both" in the app artifact (web-only items dropped). */
  channel: "app" | "both";
  title: string;
  summary?: string;
  /** Markdown body for expand-in-place. */
  body: string;
  /** Optional launch target. */
  link?: string;
  /** Launch behaviour; absent → expand-only. */
  kind?: NewsKind;
  /** ISO date; past it the item is dropped before publish (defensive here too). */
  expires?: string;
}

export interface NewsFeed {
  /** Schema version of this document format. */
  newsVersion: 1;
  /** Publish version string (timestamp) — keys "news update available". */
  version: string;
  /** ISO-8601 build time. */
  generatedAt: string;
  items: NewsFeedItem[];
}

const TAGS: ReadonlySet<string> = new Set([
  "feature",
  "calibration",
  "security",
  "release",
  "research",
  "tip",
]);

function isItem(x: unknown): x is NewsFeedItem {
  if (!x || typeof x !== "object") return false;
  const i = x as Record<string, unknown>;
  return (
    typeof i.id === "string" &&
    i.id.length > 0 &&
    typeof i.date === "string" &&
    typeof i.tag === "string" &&
    TAGS.has(i.tag) &&
    (i.channel === "app" || i.channel === "both") &&
    typeof i.title === "string" &&
    typeof i.body === "string" &&
    (i.summary === undefined || typeof i.summary === "string") &&
    (i.link === undefined || typeof i.link === "string") &&
    (i.kind === undefined ||
      i.kind === "blog" ||
      i.kind === "external" ||
      i.kind === "video") &&
    (i.expires === undefined || typeof i.expires === "string")
  );
}

export function isNewsFeed(x: unknown): x is NewsFeed {
  if (!x || typeof x !== "object") return false;
  const f = x as Record<string, unknown>;
  return (
    f.newsVersion === 1 &&
    typeof f.version === "string" &&
    typeof f.generatedAt === "string" &&
    Array.isArray(f.items) &&
    f.items.every(isItem)
  );
}
