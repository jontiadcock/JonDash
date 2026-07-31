"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { setItemSize, placeItems, isProfile } from "@/lib/dashboard/layout";
import type { DashboardKind, DashboardProfile } from "@/lib/dashboard/layout";
import { visibleModuleIds } from "@/lib/modules/visibility";
import { getUserVisibleLinks } from "@/lib/services";

type Allowed = { id: string; modules: Set<string>; links: Set<string> };

/**
 * The gate every action in this file goes through (CORE-11 / CORE-12). The user id comes from the
 * SESSION, never the form, so nobody can rearrange somebody else's dashboard.
 *
 * ⚠ Both kinds are narrowed to what this caller can actually see. A service tile can belong to a
 * service group, so without the link check a crafted request could write layout rows for a link
 * they were never shown — which also answers "does this id exist?" for it.
 *
 * REFS lib/auth/guards.ts › requireUser() · lib/security/csrf.ts › assertSameOrigin()
 *      lib/modules/visibility.ts › visibleModuleIds() · lib/services.ts › getUserVisibleLinks()
 */
async function gate(): Promise<Allowed> {
  await assertSameOrigin();
  const user = await requireUser();
  const [modules, links] = await Promise.all([
    visibleModuleIds({ id: user.id, role: user.role as "ADMIN" | "USER" }),
    getUserVisibleLinks(user.id),
  ]);
  return { id: user.id, modules, links: new Set(links.map((l) => l.id)) };
}

/** ⚠ The per-item half of the gate — every write below must pass through it. */
function permits(allowed: Allowed, kind: DashboardKind, refId: string): boolean {
  return kind === "module" ? allowed.modules.has(refId) : allowed.links.has(refId);
}

/** An unrecognised profile falls back to `wide` rather than throwing — a layout write is not
 *  worth failing a page over.  REFS lib/dashboard/geometry.ts › isProfile() */
function asProfile(v: string): DashboardProfile {
  return isProfile(v) ? v : "wide";
}

function asKind(v: string): DashboardKind {
  return v === "link" ? "link" : "module";
}

/**
 * REFS app/(app)/dashboard/dashboard-frame.tsx — the resize handle that calls it
 *      lib/dashboard/layout.ts › setItemSize() — clamps to the profile's columns and MAX_HEIGHT
 */
export async function setItemSizeAction(
  kind: string,
  refId: string,
  profile: string,
  width: number,
  height: number,
): Promise<void> {
  const allowed = await gate();
  const k = asKind(kind);
  if (!permits(allowed, k, refId)) return;
  await setItemSize(allowed.id, k, refId, asProfile(profile), width, height);
  revalidatePath("/dashboard");
}

/**
 * Save where everything sits — what a drag or a move button produces (free placement, 1.8.0).
 *
 * ⚠ The filter below is what `placeItems` relies on: it does not check visibility itself. Without
 * it a crafted request would create layout rows for restricted items.
 *
 * REFS app/(app)/dashboard/dashboard-grid.tsx — the drag that produces `placements`
 *      lib/dashboard/layout.ts › placeItems() — clamps the coordinates
 * PINS tests/unit/dashboard-paint.test.ts
 */
export async function placeItemsAction(
  profile: string,
  placements: { kind: string; id: string; col: number; row: number }[],
): Promise<void> {
  const allowed = await gate();
  const safe = placements
    .map((i) => ({ kind: asKind(i.kind), id: i.id, col: Math.trunc(i.col), row: Math.trunc(i.row) }))
    .filter((i) => permits(allowed, i.kind, i.id) && Number.isFinite(i.col) && Number.isFinite(i.row));
  if (safe.length === 0) return;
  await placeItems(allowed.id, asProfile(profile), safe);
  revalidatePath("/dashboard");
}

/*
 * ⚠ No `resetItemAction` here on purpose — it went with the Reset button. An exported server action
 * is a live HTTP endpoint whether or not anything calls it, so don't re-add one until a UI needs
 * it. `resetItem` in lib/dashboard/layout.ts stays as the API to re-expose.
 */
