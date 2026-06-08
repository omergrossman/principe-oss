// SPDX-License-Identifier: AGPL-3.0-or-later
// Load .env.local first (Next.js convention), then .env as fallback.
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/migrations",
    // Prisma 7 reads the seed command from here (package.json#prisma.seed
    // mechanism from v5/v6 is no longer honored).
    seed: "./node_modules/.bin/tsx ./prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
