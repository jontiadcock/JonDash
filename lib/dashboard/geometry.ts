/**
 * The pure, client-safe half of the layout module — no database, no request.
 *
 * ⚠ Keep it free of `server-only` imports. The grid is a client component and needs these exact
 * numbers; pulling in a server-only module here is a build error, and copying the constants into
 * the client would give the two sides values that drift apart.
 *
 * REFS lib/dashboard/layout.ts — re-exports all of this, so server code imports from one place
 */

/** What a layout row positions. REFS lib/dashboard/layout.ts › LayoutEntry.kind · itemKey() */
export type DashboardKind = "module" | "link";

/**
 * Which grid the arrangement belongs to (CORE-12). ⚠ Keyed on the VIEWPORT, never the user agent —
 * a desktop window dragged narrow must get the narrow arrangement, and rotation then works for
 * free.
 *
 * REFS lib/dashboard/layout.ts › getUserLayout() — one saved arrangement per profile
 *      app/(app)/dashboard/page.tsx · dashboard-grid.tsx · dashboard-frame.tsx · layout-actions.ts
 */
export type DashboardProfile = "wide" | "narrow";

/**
 * REFS app/(app)/dashboard/page.tsx — renders one arrangement per entry · lib/dashboard/layout.ts
 */
export const PROFILES: readonly DashboardProfile[] = ["wide", "narrow"] as const;

/** REFS app/(app)/dashboard/layout-actions.ts › asProfile() — the only untrusted-input caller */
export function isProfile(v: unknown): v is DashboardProfile {
  return v === "wide" || v === "narrow";
}

/**
 * Grid geometry, per profile. The column count is a common denominator for a service tile and a
 * module widget, at 3× the resolution the defaults need — see `DEFAULT_SPAN`.
 *
 * ⚠ No row height here on purpose: a cell is SQUARE, so the row height is the MEASURED column
 * width. A constant would be a second source of truth, wrong at every window size except one.
 *
 * REFS app/(app)/dashboard/dashboard-grid.tsx › CellMetrics — where that measuring happens
 *      lib/dashboard/layout.ts › setItemSize() · placeItems() — clamp columns against this
 */
export const GEOMETRY: Record<DashboardProfile, { columns: number }> = {
  wide: { columns: 18 },
  narrow: { columns: 6 },
};

/**
 * A tile defaults to 3×3 rather than 1×1 so it renders exactly as it always did while leaving two
 * smaller steps beneath it — that is how the minimum got smaller without shrinking anyone's board.
 *
 * ⚠ Changing these numbers resizes every existing dashboard unless a migration goes with it.
 *
 * REFS prisma/migrations/20260728010000_finer_dashboard_grid — where saved rows were multiplied
 *      lib/dashboard/layout.ts › spanFor() · placeItems() — the fallback when nothing is saved
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
 * No meaningful ceiling: width is already bounded by the column count, so only height needs a
 * number, and this one only stops a corrupt value rendering a page tens of thousands of pixels
 * tall.
 *
 * REFS lib/dashboard/layout.ts › setItemSize() — clamps to it
 *      app/(app)/dashboard/dashboard-frame.tsx — the resize ceiling the handle enforces
 */
export const MAX_HEIGHT = 24;

/** The smallest an item may be — one cell, a third of a default tile.
 *  REFS app/(app)/dashboard/dashboard-frame.tsx — the resize floor · lib/dashboard/layout.ts */
export const MIN_SPAN = 1;

/**
 * How far down the grid an item may be placed. ⚠ Free placement makes empty space below the last
 * item a legitimate destination, so there is no natural bound — this only stops a hostile value
 * rendering thousands of rows.
 *
 * REFS lib/dashboard/layout.ts › placeItems() — clamps the stored row to it
 *      app/(app)/dashboard/dashboard-grid.tsx — the drag cannot target past it
 */
export const MAX_ROWS = 240;

/** Stable key for an item across both tables — `kind:refId`.
 *  REFS lib/dashboard/layout.ts › getUserLayout() · applyLayoutOrder() · spanFor() — all key on it
 *  PINS tests/integration/module-rbac.test.ts */
export function itemKey(kind: DashboardKind, refId: string): string {
  return `${kind}:${refId}`;
}

/** A placed item: where it sits and how big it is, in grid cells. 0-based.
 *  REFS app/(app)/dashboard/dashboard-grid.tsx · lib/dashboard/layout.ts
 *  PINS tests/unit/dashboard-placement.test.ts */
export type Placement = { col: number; row: number; width: number; height: number };

/** Do two placed items occupy any of the same cells? The collision primitive both functions below
 *  are built on.  REFS lib/dashboard/layout.ts  PINS tests/unit/dashboard-placement.test.ts */
export function overlaps(a: Placement, b: Placement): boolean {
  return (
    a.col < b.col + b.width &&
    b.col < a.col + a.width &&
    a.row < b.row + b.height &&
    b.row < a.row + a.height
  );
}

/**
 * The nearest free spot for one item, searched outward from where it is. Ties break upward and
 * leftward, so an existing hole gets filled before a new row is started — that is what keeps a
 * shuffle legible rather than flinging a bumped item to the end of the grid.
 */
function nearestFree(
  item: Placement,
  current: Map<string, Placement>,
  selfKey: string,
  columns: number,
): Placement | null {
  const width = Math.min(item.width, columns);
  // Far enough to always find room — a fresh row below everything is empty by definition.
  const deepest = Math.max(0, ...[...current.values()].map((p) => p.row + p.height));
  const candidates: Placement[] = [];
  for (let row = 0; row <= deepest + item.height + 1; row++) {
    for (let col = 0; col + width <= columns; col++) {
      candidates.push({ col, row, width, height: item.height });
    }
  }
  candidates.sort((a, b) => {
    const da = (a.col - item.col) ** 2 + (a.row - item.row) ** 2;
    const db = (b.col - item.col) ** 2 + (b.row - item.row) ** 2;
    if (da !== db) return da - db;
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });
  for (const c of candidates) {
    let clash = false;
    for (const [k, p] of current) {
      if (k !== selfKey && overlaps(c, p)) {
        clash = true;
        break;
      }
    }
    if (!clash) return c;
  }
  return null;
}

/**
 * Move whatever is in the anchor's way, and nothing else. The anchor itself never moves.
 *
 * ⚠ DO NOT re-pack generally. Deliberate gaps are the point of free placement, so tidying them on
 * every move is exactly wrong — only the items the anchor overlaps shift, each to its nearest free
 * spot, cascading to anything they in turn displace.
 * ⚠ Call it against the layout as it was when the drag STARTED, with the anchor at its candidate
 * cell — never the running result, which pushes the same items repeatedly and scatters the board.
 * REFS app/(app)/dashboard/dashboard-grid.tsx — the only caller; resolves against `base`, not
 *      `working`, for exactly that reason
 * PINS tests/unit/dashboard-placement.test.ts · tests/unit/dashboard-paint.test.ts
 */
export function displaceFor(
  layout: Map<string, Placement>,
  anchorKey: string,
  columns: number,
): Map<string, Placement> {
  const result = new Map(layout);
  if (!result.has(anchorKey)) return result;

  // `settled` includes the anchor from the start: it is the one thing that may not be moved.
  const settled = new Set<string>([anchorKey]);
  const queue: string[] = [anchorKey];

  // A bound, not a proof — each pass settles at least one item. The guard makes an unforeseen
  // shape degrade into a redraw rather than locking the browser mid-gesture.
  let guard = 0;
  while (queue.length > 0 && guard++ < 500) {
    const key = queue.shift()!;
    const box = result.get(key);
    if (!box) continue;
    for (const [otherKey, other] of [...result]) {
      if (otherKey === key || settled.has(otherKey)) continue;
      if (!overlaps(box, other)) continue;
      const moved = nearestFree(other, result, otherKey, columns);
      if (!moved) return layout; // nowhere to put it — leave the board untouched
      result.set(otherKey, moved);
      settled.add(otherKey);
      queue.push(otherKey);
    }
  }
  return result;
}

/**
 * Assign a cell to every visible item — the shared source of truth for where things go. Stored
 * positions win; anything without one is packed first-fit, scanning row by row.
 *
 * ⚠ The server places everything rather than leaving it to CSS. Newly added items and installs
 * upgrading from the old ordering have no stored position, and CSS grid flows those *around*
 * placed ones unpredictably. Placing here makes server and browser agree, which is what lets a
 * drag test a candidate cell for collisions without measuring the DOM.
 *
 * REFS app/(app)/dashboard/page.tsx — the render path · lib/dashboard/layout.ts — re-export
 * PINS tests/unit/dashboard-placement.test.ts
 */
export function packLayout(
  items: { kind: DashboardKind; id: string; width: number; height: number; col?: number | null; row?: number | null }[],
  columns: number,
): Map<string, Placement> {
  const placed = new Map<string, Placement>();
  const taken: Placement[] = [];

  const fits = (p: Placement) => p.col >= 0 && p.col + p.width <= columns && p.row >= 0;
  const free = (p: Placement) => taken.every((t) => !overlaps(p, t));

  // Stored positions first, so packing can only ever fill the gaps between them — never
  // displace something the user deliberately put somewhere.
  for (const it of items) {
    if (it.col == null || it.row == null) continue;
    const width = Math.min(it.width, columns);
    const p = { col: Math.min(it.col, columns - width), row: it.row, width, height: it.height };
    if (!fits(p) || !free(p)) continue; // a stored position that no longer works is re-packed below
    placed.set(itemKey(it.kind, it.id), p);
    taken.push(p);
  }

  for (const it of items) {
    const key = itemKey(it.kind, it.id);
    if (placed.has(key)) continue;
    const width = Math.min(it.width, columns);
    const height = it.height;
    // Scan for the first free space. The bound is generous rather than clever: every item can
    // always be placed, because a fresh row is by definition empty.
    outer: for (let row = 0; ; row++) {
      for (let col = 0; col + width <= columns; col++) {
        const p = { col, row, width, height };
        if (!free(p)) continue;
        placed.set(key, p);
        taken.push(p);
        break outer;
      }
    }
  }

  return placed;
}
