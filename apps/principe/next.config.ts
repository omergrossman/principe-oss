// SPDX-License-Identifier: AGPL-3.0-or-later
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse uses pdfjs-dist under the hood, which needs to resolve a
  // worker .mjs file at runtime. Turbopack's server bundle rewrites the
  // module paths and breaks that resolution ("Cannot find module
  // .next/dev/server/chunks/..._pdf.worker.mjs"). Externalising both
  // packages tells Next to load them via Node's require at runtime, so
  // the worker resolves against the real node_modules layout.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
