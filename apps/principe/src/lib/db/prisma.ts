// SPDX-License-Identifier: AGPL-3.0-or-later
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma 7 requires a driver adapter on the client constructor. We use
 * the Postgres adapter; DATABASE_URL is read at first-query time.
 *
 * Lazy
 * proxy: PrismaClient isn't constructed until first access, so missing
 * DATABASE_URL only throws at query time, not import time.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function buildClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local to enable live data.",
    );
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = buildClient();
    }
    const value = globalForPrisma.prisma[prop as keyof PrismaClient];
    return typeof value === "function" ? value.bind(globalForPrisma.prisma) : value;
  },
});
