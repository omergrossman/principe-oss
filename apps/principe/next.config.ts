// SPDX-License-Identifier: AGPL-3.0-or-later
import type { NextConfig } from "next";

// Send HSTS only when actually served over HTTPS (same origin-scheme gate as
// cookies) — sending it over plain-HTTP localhost would be wrong.
const servedOverHttps = (process.env.WEBAUTHN_ORIGIN ?? "").startsWith(
  "https://",
);

// Content-Security-Policy. The app is fully self-contained (next/font/google
// self-hosts fonts at build time; no external scripts/images/CDN/connect), so
// everything is `'self'`. `'unsafe-inline'`/`'unsafe-eval'` are required by
// Next's inline hydration scripts/styles and the Monaco editor (which uses
// eval + blob workers) — without nonce wiring they can't be dropped, so this
// CSP hardens *source* (blocks external/attacker resources, framing,
// base-uri/form hijack, plugins) rather than inline XSS. A nonce-based
// script-src is the next tightening step.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "Content-Security-Policy", value: csp },
  ...(servedOverHttps
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // pdf-parse uses pdfjs-dist under the hood, which needs to resolve a
  // worker .mjs file at runtime. Turbopack's server bundle rewrites the
  // module paths and breaks that resolution ("Cannot find module
  // .next/dev/server/chunks/..._pdf.worker.mjs"). Externalising both
  // packages tells Next to load them via Node's require at runtime, so
  // the worker resolves against the real node_modules layout.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
