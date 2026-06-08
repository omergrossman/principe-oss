import crypto from "node:crypto";

/**
 * Lightweight URL fetcher + text extractor.
 *
 * No browser, no JS rendering. We GET the URL with a sensible UA,
 * strip HTML tags, take the first MAX_TEXT_CHARS of clean text.
 * This is enough to give the LLM a "what's on this page right now"
 * snapshot. Real periodic crawling lands later — for now this runs on
 * explicit add or refresh.
 */

const USER_AGENT =
  "Mozilla/5.0 (compatible; Principe-KnowledgeBot/1.0; +https://principe.ai)";
const MAX_TEXT_CHARS = 8000;
const FETCH_TIMEOUT_MS = 12_000;

export interface FetchedSource {
  text: string;
  contentHash: string;
  title: string | null;
  publishedAt: Date | null;
}

export async function fetchUrlAsText(url: string): Promise<FetchedSource> {
  assertExternalUrl(url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const isHtml = contentType.includes("html");
  const raw = await res.text();

  const title = isHtml ? extractTitle(raw) : null;
  const publishedAt = isHtml ? extractPublishedAt(raw) : null;
  const stripped = isHtml ? stripHtml(raw) : raw;
  const text = normaliseWhitespace(stripped).slice(0, MAX_TEXT_CHARS);
  const contentHash = crypto.createHash("sha256").update(text).digest("hex");

  return { text, contentHash, title, publishedAt };
}

/**
 * Reject SSRF-ish URLs before issuing the fetch. We only allow
 * http(s), and we block hostnames that resolve to localhost or the
 * private IP ranges used for cloud-instance metadata services and
 * internal networks. This is a coarse hostname check (not DNS
 * resolution) — sufficient for the trust model where the firm admin
 * is the only person who adds sources.
 */
function assertExternalUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Malformed URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host) ||
    /^169\.254\./.test(host) // link-local + AWS/Azure/GCP metadata
  ) {
    throw new Error(`Refusing to fetch private/loopback address (${host}).`);
  }
}

function extractTitle(html: string): string | null {
  const og = html.match(
    /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i,
  );
  if (og && og[1]) return decodeEntities(og[1]).trim().slice(0, 300);
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (title && title[1]) return decodeEntities(title[1]).trim().slice(0, 300);
  return null;
}

function extractPublishedAt(html: string): Date | null {
  const patterns = [
    /<meta\s+property=["']article:published_time["']\s+content=["']([^"']+)["']/i,
    /<meta\s+name=["']pubdate["']\s+content=["']([^"']+)["']/i,
    /<meta\s+name=["']publish-date["']\s+content=["']([^"']+)["']/i,
    /<meta\s+name=["']date["']\s+content=["']([^"']+)["']/i,
    /<time[^>]*datetime=["']([^"']+)["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) {
      const d = new Date(m[1]);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ");
}

function normaliseWhitespace(s: string): string {
  return decodeEntities(s).replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}
