// SPDX-License-Identifier: AGPL-3.0-or-later
import crypto from "node:crypto";
import net from "node:net";
import dns from "node:dns/promises";

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
const MAX_REDIRECTS = 5;

export interface FetchedSource {
  text: string;
  contentHash: string;
  title: string | null;
  publishedAt: Date | null;
}

export async function fetchUrlAsText(url: string): Promise<FetchedSource> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  let current = url;
  try {
    // Manual redirect handling so we re-run the SSRF guard on EVERY hop —
    // `redirect: "follow"` would let a public URL bounce to an internal one
    // unchecked. Cap the hop count.
    for (let hop = 0; ; hop++) {
      await assertSafeUrl(current);
      const r = await fetch(current, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal,
        redirect: "manual",
      });
      const location = r.headers.get("location");
      if (r.status >= 300 && r.status < 400 && location) {
        if (hop >= MAX_REDIRECTS) throw new Error("Too many redirects.");
        current = new URL(location, current).toString();
        continue;
      }
      res = r;
      break;
    }
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
 * SSRF guard. Allows only http(s), then ensures the target does not point at
 * a private/loopback/link-local/reserved address — including via DNS (a public
 * name that resolves to a private IP), encoded IP literals (decimal/hex/octal),
 * and IPv4-mapped IPv6. Run on the initial URL and on every redirect hop.
 *
 * Residual: there is still a small TOCTOU window between this DNS lookup and
 * the socket connect (classic DNS-rebinding). Fully closing it needs a custom
 * dispatcher that pins the connection to the validated IP; this guard closes
 * the redirect, encoding, and public-name->private-IP vectors, which are the
 * exploitable ones in practice.
 */
async function assertSafeUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Malformed URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }

  const host = normaliseHost(parsed.hostname);
  if (host === "localhost" || host.endsWith(".local")) {
    throw new Error("Refusing to fetch a loopback/local host.");
  }

  // IP literal (after normalising decimal/hex/octal/bracketed forms): classify
  // directly. Hostname: resolve and classify EVERY returned address.
  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      throw new Error(`Refusing to fetch private/reserved address (${host}).`);
    }
    return;
  }

  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new Error(`Could not resolve host: ${host}`);
  }
  if (addrs.length === 0) throw new Error(`Host did not resolve: ${host}`);
  for (const { address } of addrs) {
    if (isPrivateOrReservedIp(address)) {
      throw new Error(
        `Refusing to fetch host that resolves to a private address (${address}).`,
      );
    }
  }
}

/** Normalise a URL hostname: strip IPv6 brackets, decode integer IPv4 forms. */
function normaliseHost(hostname: string): string {
  let h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  // Decimal (2130706433), hex (0x7f000001), or octal (0177.0.0.1-style single
  // ints) representations of an IPv4 address.
  let n: number | null = null;
  if (/^0x[0-9a-f]+$/.test(h)) n = parseInt(h, 16);
  else if (/^0[0-7]+$/.test(h)) n = parseInt(h, 8);
  else if (/^\d+$/.test(h)) n = parseInt(h, 10);
  if (n !== null && Number.isFinite(n) && n >= 0 && n <= 0xffffffff) {
    return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
  }
  return h;
}

function isPrivateV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((x) => Number.isNaN(x) || x < 0 || x > 255)) {
    return true; // malformed → treat as unsafe
  }
  const [a, b] = p;
  return (
    a === 0 || // 0.0.0.0/8
    a === 127 || // loopback
    a === 10 || // private
    (a === 169 && b === 254) || // link-local + cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    a >= 224 // multicast / reserved
  );
}

function isPrivateOrReservedIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isPrivateV4(ip);
  if (kind === 6) {
    const l = ip.toLowerCase();
    if (l === "::1" || l === "::") return true; // loopback / unspecified
    if (/^fe[89ab]/.test(l)) return true; // fe80::/10 link-local
    if (/^f[cd]/.test(l)) return true; // fc00::/7 unique-local
    const m = l.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (m) return isPrivateV4(m[1]); // IPv4-mapped IPv6
    return false;
  }
  return true; // not a valid IP → unsafe
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
