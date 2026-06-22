// SPDX-License-Identifier: AGPL-3.0-or-later
import crypto from "node:crypto";
import net from "node:net";
import dns from "node:dns/promises";
import type { LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, fetch as undiciFetch } from "undici";

// We use undici's own `fetch` (not Node's global) so the `dispatcher` we pass
// belongs to the SAME undici instance that performs the request. Node's global
// fetch ships a separate, bundled undici, and passing a standalone-undici
// dispatcher to it throws UND_ERR_INVALID_ARG.

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

  let res: Awaited<ReturnType<typeof undiciFetch>>;
  let current = url;
  // The dispatcher whose socket carries the response we ultimately return —
  // kept alive until the body is fully read, then closed in `finally`.
  let liveDispatcher: Agent | null = null;
  try {
    // Manual redirect handling so we re-run the SSRF guard on EVERY hop —
    // `redirect: "follow"` would let a public URL bounce to an internal one
    // unchecked. Cap the hop count. Each hop is fetched through a dispatcher
    // pinned to the IP(s) we just validated, so the socket cannot re-resolve
    // to a different (private) address.
    for (let hop = 0; ; hop++) {
      const validated = await assertSafeUrl(current);
      const dispatcher = pinnedDispatcher(validated);
      liveDispatcher = dispatcher;
      const r = await undiciFetch(current, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal,
        redirect: "manual",
        dispatcher,
      });
      const location = r.headers.get("location");
      if (r.status >= 300 && r.status < 400 && location) {
        // Done with this hop's socket; the next hop is validated+pinned anew.
        liveDispatcher = null;
        void dispatcher.close().catch(() => dispatcher.destroy());
        if (hop >= MAX_REDIRECTS) throw new Error("Too many redirects.");
        current = new URL(location, current).toString();
        continue;
      }
      res = r;
      break;
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
  } finally {
    clearTimeout(timer);
    if (liveDispatcher) {
      void liveDispatcher.close().catch(() => liveDispatcher!.destroy());
    }
  }
}

/**
 * Build an undici dispatcher pinned to a set of pre-validated IPs. The custom
 * `lookup` short-circuits DNS resolution at connect time, returning ONLY the
 * IP(s) `assertSafeUrl` already validated for this exact hostname — so the
 * socket physically cannot connect to a different (private) address even if
 * the attacker's DNS rebinds in the TOCTOU window.
 *
 * The URL hostname is left untouched on the request, so undici still uses it
 * for the TLS `servername` (SNI) and the `Host` header: we connect to the
 * validated IP but present the original hostname, keeping cert validation and
 * virtual-host routing correct.
 */
function pinnedDispatcher(validated: ValidatedTarget): Agent {
  const lookup: LookupFunction = (hostname, options, callback) => {
    // Only the hostname we validated may be pinned; anything else (which
    // should never happen for a single connect) is refused.
    if (hostname !== validated.host) {
      callback(
        new Error(`Refusing unexpected lookup for ${hostname}.`),
        // @ts-expect-error error path: address/family unused
        undefined,
        undefined,
      );
      return;
    }
    if (options && options.all) {
      callback(
        null,
        validated.addresses.map((address) => ({
          address,
          family: net.isIP(address),
        })),
      );
      return;
    }
    const first = validated.addresses[0];
    callback(null, first, net.isIP(first));
  };

  return new Agent({
    connect: { lookup },
  });
}

interface ValidatedTarget {
  /** The (normalised) hostname presented to the server for SNI/Host. */
  host: string;
  /** The pre-validated, public IP(s) the socket is allowed to connect to. */
  addresses: string[];
}

/**
 * SSRF guard. Allows only http(s), then ensures the target does not point at
 * a private/loopback/link-local/reserved address — including via DNS (a public
 * name that resolves to a private IP), encoded IP literals (decimal/hex/octal),
 * and IPv4-mapped IPv6. Run on the initial URL and on every redirect hop.
 *
 * Returns the validated target (the hostname undici will present plus the
 * public IP(s) the socket may connect to). The DNS-rebinding TOCTOU window is
 * now CLOSED: the caller feeds these IPs into a pinned undici dispatcher
 * (`pinnedDispatcher`) whose `lookup` returns ONLY these addresses, so the
 * socket cannot re-resolve to a different IP between this check and connect.
 */
async function assertSafeUrl(rawUrl: string): Promise<ValidatedTarget> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Malformed URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }

  // `urlHost` is what undici passes to the connect-time lookup (the URL's own
  // hostname, brackets stripped for IPv6). `host` is the canonicalised form we
  // classify (decimal/hex/octal IPv4 decoded).
  const urlHost = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
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
    // An IP literal can't rebind; undici connects to it directly. Pin to the
    // canonical IP and present it as the host (it's already an address).
    return { host: urlHost, addresses: [host] };
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
  return { host: urlHost, addresses: addrs.map((a) => a.address) };
}

/** Normalise a URL hostname: strip IPv6 brackets, decode integer IPv4 forms. */
function normaliseHost(hostname: string): string {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
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

/**
 * True unless `ip` is a normal, globally-routable unicast address. Blocks
 * loopback, private (RFC1918), link-local (incl. the cloud metadata IP
 * 169.254.169.254), unique-local, CGNAT, multicast, broadcast, and reserved
 * ranges — for BOTH IPv4 and IPv6.
 *
 * Uses ipaddr.js rather than hand-rolled regex so every textual form of an
 * address normalises to the same bytes. Critically, an IPv4-mapped IPv6
 * address is unwrapped to its IPv4 form whether written dotted
 * (`::ffff:169.254.169.254`) or hex-grouped (`::ffff:a9fe:a9fe`) — the hex
 * form previously slipped past the regex guard and enabled SSRF to the
 * metadata IP. Tunnel/translation ranges (6to4, Teredo, NAT64) are also
 * non-"unicast" and therefore blocked.
 *
 * Exported for unit testing — it's the core of the SSRF guard.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  let addr: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    addr = ipaddr.parse(ip);
  } catch {
    return true; // unparseable → unsafe
  }
  if (addr.kind() === "ipv6") {
    const v6 = addr as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) addr = v6.toIPv4Address();
  }
  return addr.range() !== "unicast";
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
