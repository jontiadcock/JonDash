"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { DashboardFrame } from "./dashboard-frame";
import { ConfirmDialog } from "@/app/components/confirm-dialog";
import { placeItemsAction, resetArrangementAction } from "./layout-actions";
// `geometry`, not `layout` — the latter is server-only (Prisma), and this is a client component.
import {
  DEFAULT_SPAN,
  GEOMETRY,
  MAX_ROWS,
  displaceFor,
  type DashboardKind,
  type DashboardProfile,
  type Placement,
} from "@/lib/dashboard/geometry";

/** REFS app/(app)/dashboard/page.tsx — builds the list from tiles and module widgets alike */
export type DashboardItem = {
  kind: DashboardKind;
  id: string;
  name: string;
  /** Where clicking goes, or null when there is nowhere to go. */
  href: string | null;
  /** A service tile leaves JonDash; a module page doesn't. */
  external: boolean;
  node: React.ReactNode;
};

export type Span = { width: number; height: number };
/** REFS app/(app)/dashboard/page.tsx — computes one of these per profile, server-side */
export type ProfileArrangement = {
  order: { kind: DashboardKind; id: string }[];
  /** Every visible item's cell and size, keyed `kind:id`. Computed server-side — see the page. */
  placements: Record<string, Placement>;
};

/** Measured geometry of one grid cell, so a pointer drag becomes span units.
 *  REFS app/(app)/dashboard/dashboard-frame.tsx — converts a corner drag with it */
export type CellMetrics = { colWidth: number; rowHeight: number; columns: number };

const key = (kind: DashboardKind, id: string) => `${kind}:${id}`;

/**
 * ⚠ The one place the profile boundary is defined, and it MUST match the grid's `lg:` breakpoint
 * further down. If they disagree, what you rearrange on a phone is not what gets saved for phones.
 * REFS lib/dashboard/geometry.ts › GEOMETRY — the column count for each side of this line
 */
const WIDE_QUERY = "(min-width: 1024px)";

/**
 * The first server-rendered paint only, before the grid can be measured. Any constant is wrong at
 * some window size — that is why the real one is measured — so this just avoids a visible jump.
 */
const FALLBACK_ROW_PX = 160;

/**
 * How still the pointer must be before the board rearranges around it. ⚠ Shorter and it fires
 * mid-gesture, bringing back the churn it exists to remove; longer and a deliberate pause stops
 * answering "what would happen here?". A drop always resolves, so nothing depends on the wait.
 */
const SETTLE_MS = 220;

/**
 * The dashboard grid — service tiles and module widgets in ONE arrangement (CORE-11), saved
 * separately per device profile (CORE-12). Arranging is an explicit mode, not chrome on hover,
 * because hover cannot happen on a touch screen and the old controls sat exactly where a module
 * puts its own affordance (BUG-53).
 *
 * ⚠ Dragging is pointer-driven, never HTML5 drag-and-drop: the native API paints an unstylable
 * drag image, ignores touch, and gives no position fine enough to reflow against.
 *
 * REFS app/(app)/dashboard/page.tsx — the only caller; computes both arrangements server-side
 *      app/(app)/dashboard/dashboard-frame.tsx — one per item, and owns the resize gesture
 *      app/(app)/dashboard/layout-actions.ts › placeItemsAction() — where a drop is saved
 */
export function DashboardGrid({
  items,
  arrangements,
}: {
  items: DashboardItem[];
  arrangements: Record<DashboardProfile, ProfileArrangement>;
}) {
  // The server cannot see the viewport, so it renders `wide` and this corrects on mount. Both
  // profiles start identical, so the correction is invisible until someone makes them differ.
  const [profile, setProfile] = useState<DashboardProfile>("wide");
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const apply = () => setProfile(mq.matches ? "wide" : "narrow");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  /**
   * The profile a WRITE is filed under, read from the viewport at the moment of saving.
   *
   * ⚠ Do not use the state above for this. It depends on a `change` event arriving, and a missed
   * one would file the arrangement against the OTHER device — the exact failure CORE-12 exists to
   * prevent. State still drives RENDERING, which must stay stable across a render pass.
   * REFS app/(app)/dashboard/dashboard-frame.tsx — passed down and called at save time
   */
  const writeProfile = useCallback(
    (): DashboardProfile => (window.matchMedia(WIDE_QUERY).matches ? "wide" : "narrow"),
    [],
  );

  const arrangement = arrangements[profile];
  const [order, setOrder] = useState(() => arrangements.wide.order.map((i) => key(i.kind, i.id)));
  /**
   * Where every item sits, as grid cells (free placement, 1.8.0). Deliberately separate from
   * `order`, which is now only DOM order and so decides tab order and nothing visual — that split
   * is what makes dragging calm: moving one item changes one entry here and nothing else moves.
   * REFS lib/dashboard/geometry.ts › packLayout() — the server produces the seed values
   */
  const [placements, setPlacements] = useState<Map<string, Placement>>(
    () => new Map(Object.entries(arrangements.wide.placements)),
  );
  const [editing, setEditing] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [, startTransition] = useTransition();
  const gridRef = useRef<HTMLDivElement>(null);

  /** Which item is under the pointer, and how far it has been dragged from where it started. */
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragDelta, setDragDelta] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  /** Live element per item, for hit-testing a pointer against real geometry and for FLIP. */
  const frames = useRef(new Map<string, HTMLElement>());
  const registerFrame = useCallback((k: string, el: HTMLElement | null) => {
    if (el) frames.current.set(k, el);
    else frames.current.delete(k);
  }, []);

  /*
   * ⚠ Re-seed whenever the SERVER's arrangement changes, not only when the profile does. The
   * server's placements also change on a resize, a reset or an added item, and keying on profile
   * alone meant those never reached the screen — the grid kept rendering what it cached at mount.
   * Comparing the serialised placements catches every case; a drag's own optimistic update is safe
   * because it produces the same string the server sends back.
   */
  const serverKey = `${profile}:${JSON.stringify(arrangement.placements)}`;
  const [seededFrom, setSeededFrom] = useState(serverKey);
  if (seededFrom !== serverKey) {
    setSeededFrom(serverKey);
    setOrder(arrangement.order.map((i) => key(i.kind, i.id)));
    setPlacements(new Map(Object.entries(arrangement.placements)));
  }

  const byKey = new Map(items.map((i) => [key(i.kind, i.id), i]));
  const ordered = order.map((k) => byKey.get(k)).filter((i): i is DashboardItem => !!i);

  /**
   * ⚠ Sends the WHOLE arrangement, not just the item that moved — most items have no stored
   * position until someone drags something, so writing only the moved one leaves the rest free to
   * shuffle next time anything is added or removed.
   * REFS app/(app)/dashboard/layout-actions.ts › placeItemsAction() — filters to visible items
   *      lib/dashboard/layout.ts › placeItems() — clamps and writes the same whole set
   */
  function commit(next: Map<string, Placement>) {
    setPlacements(next);
    const payload = [...next.entries()]
      .map(([k, p]) => ({ item: byKey.get(k), p }))
      .filter((e): e is { item: DashboardItem; p: Placement } => !!e.item)
      .map(({ item, p }) => ({ kind: item.kind as string, id: item.id, col: p.col, row: p.row }));
    startTransition(() => void placeItemsAction(writeProfile(), payload));
  }

  /**
   * Where an item would land, given how far it has been dragged; `null` when that is off the grid.
   *
   * ⚠ Computed from the item's ORIGIN plus distance travelled, never from the pointer position —
   * that is what keeps the grab point under your finger, so a tile picked up by its corner stays
   * held by that corner instead of jumping to centre itself on the cursor.
   */
  function candidateCell(from: Placement, dx: number, dy: number): Placement | null {
    const metrics = cellMetrics();
    if (!metrics) return null;
    const col = from.col + Math.round(dx / metrics.colWidth);
    const row = from.row + Math.round(dy / metrics.rowHeight);
    // Only the grid edges constrain it — landing on an occupied cell is no longer refused.
    // REFS lib/dashboard/geometry.ts › displaceFor() — moves whatever is in the way
    if (col < 0 || col + from.width > metrics.columns) return null;
    if (row < 0 || row > MAX_ROWS) return null;
    return { col, row, width: from.width, height: from.height };
  }

  /*
   * Pointer-driven dragging onto a CELL, not into an ordering. The drag asks "which cell am I
   * over", never "which item am I over, and should we swap" — an ordering cannot express a gap,
   * and swapping made every item after the held one shuffle along as you moved.
   *
   * ⚠ Every frame resolves against `base`, the layout as it was at pointerdown — never against
   * the running result, which would push the same items repeatedly and scatter the board.
   * Dropping onto an occupied cell moves only what is actually in the way.
   * REFS lib/dashboard/geometry.ts › displaceFor() — enforces both of those rules
   */
  function beginDrag(k: string, e: React.PointerEvent) {
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = placements.get(k);
    if (!origin) return;

    /*
     * `base` is the board at pointerdown and is never written to; `working` is what the screen
     * shows. ⚠ Plain closure variables, not state or a ref: `pointermove` must read them
     * synchronously and state would be a render behind. `beginDrag` is defined during render, so
     * it closes over exactly what the user grabbed.
     */
    const base = placements;
    let working = placements;
    let lastDx = 0;
    let lastDy = 0;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    setDragKey(k);
    setDragDelta({ x: 0, y: 0 });

    /**
     * How far the tile must sit from its own cell to stay under the pointer. Between resolves this
     * grows to the full pointer distance; right after one it collapses to the sub-cell remainder.
     * Both are the same subtraction, which is why the tile never jumps.
     *
     * ⚠ A `const` arrow, not a `function` declaration — a hoisted declaration is not covered by
     * the `if (!origin) return` above, so TypeScript will not narrow `origin` inside one.
     */
    const remainder = (dx: number, dy: number) => {
      const metrics = cellMetrics();
      const at = working.get(k) ?? origin;
      const cellDx = metrics ? (at.col - origin.col) * metrics.colWidth : 0;
      const cellDy = metrics ? (at.row - origin.row) * metrics.rowHeight : 0;
      return { x: dx - cellDx, y: dy - cellDy };
    };

    /** Work out the board for where the pointer is now, and show it. ⚠ Called when the pointer
     *  PAUSES or is released — never continuously; see `move` below. */
    const resolve = () => {
      const next = candidateCell(origin, lastDx, lastDy);
      if (!next) return;
      const at = working.get(k);
      if (at && at.col === next.col && at.row === next.row) return;
      // ⚠ Against BASE, not `working` — so the shuffle undoes itself when you move back rather
      // than accumulating as you cross the board.
      const columns = cellMetrics()?.columns ?? GEOMETRY[profile].columns;
      working = displaceFor(new Map(base).set(k, next), k, columns);
      setPlacements(working);
      // The tile just snapped to a cell, so its offset from the pointer changed. Recompute it
      // here or it visibly jumps by however far the cell moved.
      setDragDelta(remainder(lastDx, lastDy));
    };

    /*
     * ⚠ Nothing shuffles while the pointer is moving — only on a pause or a drop.
     *
     * Recomputing per cell change was erratic for two compounding reasons: a rounded target cell
     * flips back and forth on the least jitter near a boundary, and each flip can send a displaced
     * tile somewhere quite different, because the nearest free space for one anchor cell need not
     * be near the nearest free space for the next. Every flip then animated, several at once.
     * Waiting for a pause also doubles as a preview of what dropping there would do.
     */
    const move = (ev: PointerEvent) => {
      lastDx = ev.clientX - startX;
      lastDy = ev.clientY - startY;
      setDragDelta(remainder(lastDx, lastDy));
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(resolve, SETTLE_MS);
    };

    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      // A drop always resolves, however fast it was — a flick that never paused must still land.
      if (settleTimer) clearTimeout(settleTimer);
      resolve();

      /*
       * ⚠ DO NOT animate the dropped tile. Deleting its previous rect is what stops it: the FLIP
       * effect below iterates `prevRects`, so a missing key is simply not animated.
       *
       * A drop is the one moment several things move the tile at once — the drag transform comes
       * off, the layout effect fires for the local update, and the server round-trip fires it
       * again — each with its own idea of where the tile came from, which flung it off-screen and
       * eased it back. There is nothing to animate anyway: the tile is already under the pointer
       * and its cell is at most half a cell away. The SHOVED tiles still animate, and should.
       */
      prevRects.current.delete(k);

      /*
       * Ask the layout effect to take the drag transform off WITHOUT animating it.
       *
       * ⚠ The frame's `transition` class covers `transform`, so when React removes the inline drag
       * offset on release the class ANIMATES the removal — the tile snaps to its new cell and then
       * slides in from where it was held. This is not a FLIP fault.
       * ⚠ It has to be a note for later, not a fix here: React has not committed the new cell yet,
       * so clearing it now paints one frame at the OLD cell instead.
       */
      settlingRef.current = k;

      setDragKey(null);
      setDragDelta({ x: 0, y: 0 });
      commit(working); // ONE write, for where it actually ended up
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  /*
   * FLIP, because CSS grid does not animate reflow — a moved item just appears in its new cell.
   * Remember where everything was, let React re-render, put each moved item back with a transform,
   * then release it. The dragged item is excluded: it already follows the pointer.
   */
  const prevRects = useRef(new Map<string, DOMRect>());
  /** The tile just dropped, if any — its drag transform must come off without animating. */
  const settlingRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    /*
     * ⚠ This is the ONLY moment both facts are true: React has moved the tile to its new cell and
     * removed the inline drag transform, and the browser has not painted yet. Suppressing the
     * transition and forcing a flush here makes "no transform" something the browser commits
     * rather than a destination it animates towards. REFS `settlingRef` is set in `end()` above
     */
    const settling = settlingRef.current;
    if (settling) {
      settlingRef.current = null;
      const el = frames.current.get(settling);
      if (el) {
        el.style.transition = "none";
        el.style.transform = "";
        void el.offsetWidth; // commit it, then hand styling back to the class
        el.style.transition = "";
      }
    }

    const now = new Map<string, DOMRect>();
    frames.current.forEach((el, k) => now.set(k, el.getBoundingClientRect()));

    const still = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!still) {
      prevRects.current.forEach((before, k) => {
        const el = frames.current.get(k);
        const after = now.get(k);
        if (!el || !after || k === dragKey) return;
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

        /*
         * Don't animate a journey nobody could follow. A tile can legitimately move most of a
         * screen; inverting that starts it outside the viewport and flies it back in, which reads
         * as vanishing rather than moving. Past a screenful, just let it be in its new place.
         */
        if (Math.abs(dx) > window.innerWidth || Math.abs(dy) > window.innerHeight) return;
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        /*
         * ⚠ Release SYNCHRONOUSLY after forcing a style flush — never from `requestAnimationFrame`.
         * rAF does not run in a hidden tab, and one that never fires strands the inverted transform
         * on the element: the item sits displaced AND `getBoundingClientRect` then reports the
         * wrong position, so the next drag hit-tests against geometry that no longer exists.
         * Reading `offsetWidth` applies the transform before the next two lines overwrite it, which
         * is all the rAF was ever for.
         */
        void el.offsetWidth;
        el.style.transition = "transform 180ms cubic-bezier(0.2, 0, 0.2, 1)";
        el.style.transform = "";

        /*
         * ⚠ Hand the element back to its stylesheet, or both properties stay inline forever and the
         * stranded `transition` re-times everything else the element does — most visibly the hover
         * lift, which then runs on FLIP's 180ms easing during the settle.
         * `once` so listeners cannot accumulate across drags; registered before the transition can
         * finish, so it cannot be missed.
         */
        el.addEventListener(
          "transitionend",
          () => {
            el.style.transition = "";
            el.style.transform = "";
          },
          { once: true },
        );
      });
    }
    prevRects.current = now;
  }, [placements, dragKey]);

  /*
   * ⚠ There is no one-cell nudge helper any more; it went with the ←↑↓→ buttons. Don't re-add one
   * without the buttons — a helper with no caller reads as something that still works.
   */

  /**
   * ⚠ Measure a cell from the live grid, never hardcode it: the column count changes with the
   * breakpoint and the row height is derived from it, so a constant here silently disagrees with
   * what is on screen. REFS app/(app)/dashboard/dashboard-frame.tsx — receives this as a callback
   */
  const cellMetrics = useCallback((): CellMetrics | null => {
    const el = gridRef.current;
    if (!el) return null;
    const cs = getComputedStyle(el);
    const columns = Math.max(1, cs.gridTemplateColumns.split(" ").filter(Boolean).length);
    const colGap = parseFloat(cs.columnGap) || 0;
    const rowGap = parseFloat(cs.rowGap) || 0;
    return {
      columns,
      colWidth: (el.clientWidth - colGap * (columns - 1)) / columns + colGap,
      rowHeight: (parseFloat(cs.gridAutoRows) || FALLBACK_ROW_PX) + rowGap,
    };
  }, []);

  /*
   * SQUARE CELLS — the row height tracks the MEASURED column width. ⚠ It cannot be declared: CSS
   * can size a row from its content or a fixed value, but not from the width of a column it does
   * not know, and the columns here are fluid. With a constant, a 1×1 was landscape at one window
   * width and portrait at another. ResizeObserver rather than a `resize` listener, so a window
   * change that fires no `resize` event is still caught.
   * REFS lib/dashboard/geometry.ts › GEOMETRY — states why no row height lives there
   */
  const [rowPx, setRowPx] = useState<number | null>(null);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const columns = Math.max(1, cs.gridTemplateColumns.split(" ").filter(Boolean).length);
      const colGap = parseFloat(cs.columnGap) || 0;
      const w = (el.clientWidth - colGap * (columns - 1)) / columns;
      if (w > 0) setRowPx(Math.round(w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Your dashboard</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Only while arranging: it is part of that mode, not a permanent control on the page. */}
          {editing && (
            <button
              type="button"
              onClick={() => setConfirmingReset(true)}
              className="btn btn-warning !py-1.5 text-sm"
            >
              Reset positions
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className={editing ? "btn btn-primary !py-1.5 text-sm" : "btn btn-ghost !py-1.5 text-sm"}
            aria-pressed={editing}
          >
            {editing ? "Done arranging" : "Arrange"}
          </button>
        </div>
      </div>

      {/*
        ⚠ Confirmed, because it discards every position and size in this profile at once and there is
        no undo. Yellow rather than red: it destroys arranging WORK, never data.
      */}
      <ConfirmDialog
        open={confirmingReset}
        title="Reset positions?"
        message={
          profile === "narrow"
            ? "Every tile and widget goes back to its default position and size on narrow screens. Your wide-screen layout is untouched."
            : "Every tile and widget goes back to its default position and size on wide screens. Your narrow-screen layout is untouched."
        }
        confirmLabel="Reset positions"
        danger={false}
        onCancel={() => setConfirmingReset(false)}
        onConfirm={() => {
          setConfirmingReset(false);
          /*
           * Clear the optimistic map too. The server render re-seeds it via `serverKey`, but that
           * arrives a beat later — without this the grid holds the old positions until it does, so
           * the button looks like it did nothing.
           */
          setPlacements(new Map());
          startTransition(() => void resetArrangementAction(writeProfile()));
        }}
      />

      {editing && (
        <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
          Drag anything anywhere — leave gaps if you want to. The bottom-right corner of each item
          resizes it, and works with the arrow keys.{" "}
          {profile === "narrow"
            ? "Saved for narrow screens only — your desktop layout is untouched."
            : "Saved for wide screens only — your phone layout is untouched."}
        </p>
      )}

      {/*
        ⚠ `gridAutoRows` must stay a FIXED pixel value (BUG-59). A growable track sizes itself to
        its content, and an item spanning several rows spreads content across all of them — so
        resizing one item silently re-sized the rows it shared with a neighbour, moving it.
        `rowPx` is the measured column width, which is what makes N×N genuinely square.
        ⚠ The `lg:` breakpoint here IS the profile boundary — keep it equal to `WIDE_QUERY`.
      */}
      <div
        ref={gridRef}
        className="grid grid-cols-[repeat(6,minmax(0,1fr))] gap-2 lg:grid-cols-[repeat(18,minmax(0,1fr))]"
        style={{ gridAutoRows: `${rowPx ?? FALLBACK_ROW_PX}px` }}
      >
        {ordered.map((item) => {
          const k = key(item.kind, item.id);
          const fallback = DEFAULT_SPAN[profile][item.kind];
          // Every item has a cell — the server packs anything without a stored one. The fallback
          // only covers an item that appeared between the server render and this one.
          const at = placements.get(k) ?? { col: 0, row: 0, ...fallback };
          return (
            <DashboardFrame
              key={k}
              kind={item.kind}
              refId={item.id}
              name={item.name}
              href={item.href}
              external={item.external}
              writeProfile={writeProfile}
              col={at.col}
              row={at.row}
              width={at.width}
              height={at.height}
              editing={editing}
              dragging={dragKey === k}
              dragDelta={dragKey === k ? dragDelta : null}
              registerEl={registerFrame}
              cellMetrics={cellMetrics}
              onGrab={(e) => beginDrag(k, e)}
            >
              {item.node}
            </DashboardFrame>
          );
        })}
      </div>
    </>
  );
}
