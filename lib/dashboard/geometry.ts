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

/**
 * How far down the grid an item may be placed.
 *
 * Free placement means empty space below the last item is a legitimate destination, so unlike
 * the column count there is no natural bound here — this one exists only so a corrupt or hostile
 * value cannot generate a page thousands of rows tall. At the default tile size it is roughly
 * eighty screens, which nobody reaches on purpose.
 */
export const MAX_ROWS = 240;

/** Stable key for an item across both tables — `kind:refId`. */
export function itemKey(kind: DashboardKind, refId: string): string {
  return `${kind}:${refId}`;
}

/** A placed item: where it sits and how big it is, in grid cells. 0-based. */
export type Placement = { col: number; row: number; width: number; height: number };

/** Do two placed items occupy any of the same cells? */
export function overlaps(a: Placement, b: Placement): boolean {
  return (
    a.col < b.col + b.width &&
    b.col < a.col + a.width &&
    a.row < b.row + b.height &&
    b.row < a.row + a.height
  );
}

/**
 * The nearest free spot for one item, searched outward from where it already is.
 *
 * "Nearest" is what keeps a shuffle legible: an item bumped by a neighbour should end up beside
 * where it was, not flung to the end of the grid. Ties break upward and leftward, so a row that
 * had a hole in it gets filled rather than a new row being started.
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
 * Move whatever is in the anchor's way, and nothing else.
 *
 * Owner, 2026-07-28: *"when I drop a tile on top of another tile, [make] the other tiles shuffle
 * over."* Dropping onto an occupied cell used to be refused outright — the tile returned to where
 * it came from, which was safe but felt like being told off.
 *
 * **This is in tension with free placement and the tension is resolved deliberately.** Gaps are
 * the point of free placement — *"one icon at the top, and one at the bottom, not directly next to
 * each other"* — so a general re-pack is exactly wrong: it would tidy away every deliberate space
 * every time anything moved. Instead only the items the anchor actually overlaps are touched, each
 * moves to its NEAREST free spot, and the cascade repeats for anything they in turn displace.
 * Everything not in the way is left byte-for-byte alone.
 *
 * **The anchor never moves.** Where you dropped it is where it goes; the grid rearranges around it
 * rather than negotiating with it.
 *
 * **Always call this against the layout as it was when the drag STARTED**, with the anchor moved
 * to its candidate cell — never against the running result. Applied cumulatively, dragging across
 * a full grid would push the same items again and again and scatter the board; applied to the
 * original each time it is stable and reversible, so moving back undoes the shuffle exactly.
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

  // A bound rather than a proof. Each pass settles at least one item, so it terminates well
  // inside this; the guard exists so a shape nobody predicted degrades into a redraw rather than
  // locking the browser mid-gesture.
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
 * Assign a cell to every visible item — the shared source of truth for where things go.
 *
 * **Why the server computes this rather than letting CSS place things.** Free placement (owner,
 * 2026-07-28: *"I could have one icon at the top, and one at the bottom, not directly next to
 * each other"*) means an item's position is data, not a consequence of its order. But not every
 * item has a stored position — anything newly added, and every install upgrading from the
 * ordering that came before — and CSS grid's own auto-placement flows those *around* explicitly
 * placed ones in ways that are hard to predict and impossible to reproduce on the server.
 *
 * So everything is placed here instead: stored positions are honoured, and anything without one
 * is packed into the first free space in `sortOrder`. The result is identical on the server and
 * in the browser, which is what lets the drag test a candidate cell for collisions without
 * measuring the DOM.
 *
 * Packing is **first-fit, scanning row by row**, which is the behaviour people expect from a
 * grid: a new item lands in the first gap big enough for it, rather than always at the end.
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
