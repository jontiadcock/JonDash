/**
 * Dashboard grid geometry — the pure, **client-safe** half of the layout module.
 *
 * Split out of `layout.ts` because that file is `server-only` (it talks to Prisma) and the grid
 * is a client component that genuinely needs these numbers: it renders the fallback span for an
 * item with no saved row, and it clamps a resize before sending it. Importing a `server-only`
 * module into a client bundle is a build error, and duplicating the constants on the client
 * would create two sources of truth that drift the first time one of them changes.
 *
 * Nothing here touches the database or the request. `layout.ts` re-exports all of it, so server
 * code carries on importing from the one place it always did.
 */

/** What a layout row positions. */
export type DashboardKind = "module" | "link";

/**
 * Which grid the arrangement belongs to (CORE-12).
 *
 * Keyed on the VIEWPORT, not the user agent. The viewport is what actually decides which grid
 * renders — a UA check is simply wrong for a desktop window dragged narrow (it would serve the
 * desktop arrangement into the one-column grid), is ambiguous for tablets, and UA strings are
 * neither stable nor trustworthy. Viewport also handles rotation for free.
 */
export type DashboardProfile = "wide" | "narrow";

export const PROFILES: readonly DashboardProfile[] = ["wide", "narrow"] as const;

export function isProfile(v: unknown): v is DashboardProfile {
  return v === "wide" || v === "narrow";
}

/**
 * Grid geometry, per profile.
 *
 * One grid holds two things that were previously sized independently: a service tile (small,
 * iconic) and a module widget. The column count is therefore a common denominator rather than
 * either of the old ones, at **3× the resolution the default sizes need** — see `DEFAULT_SPAN`.
 *
 * **There is no row height here on purpose.** A cell is SQUARE — the row height is the measured
 * column width, computed in the browser (`dashboard-grid.tsx`), because the columns are fluid
 * and CSS cannot size a row from the width of a column. A constant here would be a second
 * source of truth that is wrong at every window size except one.
 */
export const GEOMETRY: Record<DashboardProfile, { columns: number }> = {
  wide: { columns: 18 },
  narrow: { columns: 6 },
};

/**
 * The grid runs at **3× the resolution it needs for the default sizes** (owner, 2026-07-27:
 * *"the minimum size is still too big — make them able to be 3× smaller"*).
 *
 * A tile's default is 3×3 rather than 1×1, so it looks exactly as it did while leaving two
 * smaller steps beneath it. That is the only way to offer a smaller minimum without shrinking
 * everybody's existing dashboard: the unit gets finer and the defaults grow to match, so the
 * rendered size is unchanged and 1×1 becomes a genuinely small tile that someone can choose.
 *
 * Existing saved layouts are multiplied by 3 in the migration for the same reason.
 */
export const DEFAULT_SPAN: Record<DashboardProfile, Record<DashboardKind, { width: number; height: number }>> = {
  wide: {
    link: { width: 3, height: 3 },
    module: { width: 6, height: 6 },
  },
  narrow: {
    link: { width: 3, height: 3 },
    module: { width: 6, height: 6 },
  },
};

/**
 * No meaningful ceiling on height (owner: *"allow them to be expanded as large as needed, no max
 * size"*). Width is naturally bounded by the column count — you cannot span more grid than exists
 * — so only height needs a number, and this one is high enough never to be reached deliberately
 * while still stopping a corrupt value from generating a page tens of thousands of pixels tall.
 */
export const MAX_HEIGHT = 24;

/** The smallest an item may be. One cell — a third of a default tile, which was the ask. */
export const MIN_SPAN = 1;

/** Stable key for an item across both tables — `kind:refId`. */
export function itemKey(kind: DashboardKind, refId: string): string {
  return `${kind}:${refId}`;
}
