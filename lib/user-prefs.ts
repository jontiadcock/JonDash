import "server-only";
import { prisma } from "@/lib/db";

/**
 * Small per-user UI state — things a person has decided, that follow them rather than their browser.
 *
 * **Uses the `Setting` table's `user` scope**, which has existed since the schema was written and
 * had never been used ("global scope for now; the table also supports per-user / per-module scopes
 * for later"). No migration, no new table: `@@unique([scope, ownerId, key])` already makes one row
 * per person per key.
 *
 * **Deliberately not the typed settings registry.** That registry is for configuration an admin
 * changes on a settings page — it has zod schemas, defaults, groups, secret handling and a cache
 * built around a small fixed set of keys. This is a boolean somebody set by clicking "No thanks".
 * Running it through the registry would mean every piece of per-user UI state becoming a
 * registered, defaulted, cached global, which is the wrong shape and the wrong blast radius.
 *
 * **Why not `localStorage`, which is where this started:** it is per browser *and per origin*. A
 * self-hosted dashboard is opened at `localhost:3000` on the machine it runs on and at
 * `192.168.1.50:3000` from a phone — different origins, so a decision made in one is invisible to
 * the other, and both are the same person. That is BUG-74: dismissing the support banner on a phone
 * and meeting it again on a desktop.
 */
async function read(userId: string, key: string): Promise<string | null> {
  try {
    const row = await prisma.setting.findUnique({
      where: { scope_ownerId_key: { scope: "user", ownerId: userId, key } },
      select: { valueJson: true },
    });
    return row?.valueJson ?? null;
  } catch {
    // UI state is never worth an error page.
    return null;
  }
}

/** True when this user has set this flag. Absent or unreadable reads as false. */
export async function getUserFlag(userId: string, key: string): Promise<boolean> {
  return (await read(userId, key)) === "true";
}

/** Set a per-user flag. Best-effort: failing to remember a dismissal must not fail the action. */
export async function setUserFlag(userId: string, key: string, value: boolean): Promise<void> {
  try {
    await prisma.setting.upsert({
      where: { scope_ownerId_key: { scope: "user", ownerId: userId, key } },
      create: { scope: "user", ownerId: userId, key, valueJson: String(value) },
      update: { valueJson: String(value) },
    });
  } catch {
    /* the dismissal just won't persist */
  }
}

/** Keys used with the helpers above. Named here so they cannot drift between reader and writer. */
export const USER_FLAG = {
  /** CORE-05 — the support banner has been dismissed. Never shown again once set. */
  supportBannerDismissed: "ui.supportBannerDismissed",
} as const;
