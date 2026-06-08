// SPDX-License-Identifier: AGPL-3.0-or-later
import type { NextConfig } from "next";

// Send HSTS only when actually served over HTTPS (same origin-scheme gate as
// cookies) — sending it over plain-HTTP localhost would be wrong. A full
// script-src/style-src CSP is intentionally NOT set here: it needs nonce
// wiring + interactive testing against Monaco/Next to avoid breaking the app.
// `frame-ancestors 'none'` (clickjacking) + the headers below are the
// zero-risk hardening; tighten CSP in a follow-up.
const servedOverHttps = (process.env.WEBAUTHN_ORIGIN ?? "").startsWith(
  "https://",
);

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
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
