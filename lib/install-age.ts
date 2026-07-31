import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";

/**
 * How long this install has been in use, in days — from the OLDEST account, created during
 * first-run setup and the closest thing to an install date that already exists. A bootstrap
 * timestamp would need a migration and would read as zero for every existing install, treating
 * long-standing users as brand new.
 *
 * ⚠ `cache`d per request: it is read from a layout that renders on every page.
 * REFS app/(app)/layout.tsx · app/admin/layout.tsx — both gate the support banner on it
 *      app/components/support.tsx › SupportBanner — the seven-day hold (CORE-05)
 */
export const installedDaysAgo = cache(async (): Promise<number> => {
  try {
    const first = await prisma.user.findFirst({
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    if (!first) return 0;
    const ms = Date.now() - first.createdAt.getTime();
    return Math.max(0, Math.floor(ms / 86_400_000));
  } catch {
    // ⚠ A banner is never worth an error page. Zero reads as "new", so it does not ask.
    return 0;
  }
});
