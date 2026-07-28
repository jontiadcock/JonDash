import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";

/**
 * How long this install has been in use, in days.
 *
 * Taken from the **oldest account**, which is created during first-run setup and is therefore the
 * closest thing to an install date that already exists. The alternative — writing a timestamp
 * somewhere at bootstrap — would mean a migration, and would read as zero for every install that
 * already exists, so the one group of people who have definitely been using JonDash for a while
 * would be treated as brand new.
 *
 * Used to hold the support banner back for the first week (CORE-05): somebody who has just finished
 * setup has no idea yet whether they like this, and asking them for money is the fastest way to make
 * sure they don't.
 *
 * `cache`d per request — it is read from a layout that renders on every page.
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
    // A banner is never worth an error page. Zero means "new", which means "don't ask".
    return 0;
  }
});
