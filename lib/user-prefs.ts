import "server-only";
import { prisma } from "@/lib/db";

/**
 * Small per-user UI state — things a person decided, following them rather than their browser. Uses
 * the `Setting` table's `user` scope, whose `@@unique([scope, ownerId, key])` already gives one row
 * per person per key, so there is no migration and no new table.
 *
 * ⚠ Deliberately NOT the typed settings registry. That is for admin configuration and carries zod
 * schemas, defaults, groups, secret handling and a cache built for a small fixed key set; routing
 * per-user UI state through it makes every dismissal a registered, cached global.
 * ⚠ Never `localStorage` — it is per browser AND per origin, so a dashboard opened at `localhost`
 * on its own machine and at a LAN address from a phone loses the decision between them (BUG-74).
 *
 * REFS prisma/schema.prisma › Setting — the shared table · lib/settings.ts — the other consumer
 */
async function read(userId: string, key: string): Promise<string | null> {
  try {
    const row = await prisma.setting.findUnique({
      where: { scope_ownerId_key: { scope: "user", ownerId: userId, key } },
      select: { valueJson: true },
    });
    return row?.valueJson ?? null;
  } catch {
    // ⚠ UI state is never worth an error page.
    return null;
  }
}

/** True when this user has set this flag; absent or unreadable reads as false.
 *  REFS app/(app)/layout.tsx · app/admin/layout.tsx — both read the banner flag per request
 *       app/components/support-actions.ts — the write side, which must not re-export a read */
export async function getUserFlag(userId: string, key: string): Promise<boolean> {
  return (await read(userId, key)) === "true";
}

/** Set a per-user flag. ⚠ Best-effort — failing to remember a dismissal must not fail the action.
 *  REFS app/components/support-actions.ts — the only caller; a `"use server"` module */
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
/** REFS app/(app)/layout.tsx · app/admin/layout.tsx · app/components/support-actions.ts */
export const USER_FLAG = {
  /** CORE-05 — the support banner has been dismissed. Never shown again once set. */
  supportBannerDismissed: "ui.supportBannerDismissed",
} as const;
