import "server-only";
import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton. ⚠ Cached on `globalThis` outside production because hot reload would
 * otherwise open a new connection per reload until the pool is exhausted.
 * REFS lib/config.ts — DATABASE_URL · prisma/schema.prisma — imported by ~90 files
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** The single client, imported by ~90 files. REFS prisma/schema.prisma · lib/config.ts */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
