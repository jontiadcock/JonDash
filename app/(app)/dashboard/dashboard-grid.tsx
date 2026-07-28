"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { DashboardFrame } from "./dashboard-frame";
import { placeItemsAction } from "./layout-actions";
// `geometry`, not `layout` — the latter is server-only (Prisma), and this is a client component.
import {
  DEFAULT_SPAN,
  MAX_ROWS,
  overlaps,
  type DashboardKind,
  type DashboardProfile,
  type Placement,
} from "@/lib/dashboard/geometry";

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
export type ProfileArrangement = {
  order: { kind: DashboardKind; id: string }[];
  /** Every visible item's cell and size, keyed `kind:id`. Computed server-side — see the page. */
  placements: Record<string, Placement>;
};

/** Measured geometry of one grid cell, so a pointer drag becomes span units. */
export type CellMetrics = { colWidth: number; rowHeight: number; columns: number };

const key = (kind: DashboardKind, id: string) => `${kind}:${id}`;

/**
 * The one place the profile boundary is defined. It must match the grid's `lg:` breakpoint
 * below — two column counts, two saved arrangements — or what you rearrange on a phone would
 * not be the thing being saved for phones.
 */
const WIDE_QUERY = "(min-width: 1024px)";

/**
 * Only used for the very first server-rendered paint, before the grid can be measured. Any
 * value is wrong at some window size — that is the whole reason the real one is measured — so
 * this is simply a plausible column width that avoids a visible jump on a typical desktop.
 */
const FALLBACK_ROW_PX = 160;

/**
 * The dashboard grid — service tiles and module widgets in ONE arrangement (CORE-11), saved
 * separately per device profile (CORE-12).
 *
 * **Two modes.** Normally an item is simply a thing you click. Arranging is an explicit mode
 * rather than chrome revealed on hover, because hover cannot happen on a touch screen and the
 * old controls sat exactly where a module puts its own affordance (BUG-53).
 *
 * **The `lg:` breakpoint IS the profile boundary.** Two column counts, two saved arrangements,
 * one rule — so what you rearrange on a phone is always the thing being saved for phones.
 *
 * **Dragging is pointer-driven, not HTML5 drag-and-drop.** The native API paints its own drag
 * image — the grey box with the URL in it that the owner reported — which cannot be styled away,
 * ignores touch, and gives no position updates fine enough to reflow against. Pointer events give
 * a real position on every move, so the item can follow the cursor and everything else can move
 * out of its way while you are still holding it.
 */
export function DashboardGrid({
  items,
  arrangements,
}: {
  items: DashboardItem[];
  arrangements: Record<DashboardProfile, ProfileArrangement>;
}) {
  /*
   * The server cannot see the viewport, so it renders `wide` and this corrects on mount. Both
   * profiles start identical, so the correction is invisible until somebody has deliberately
   * made them differ — see the note on the page.
   */
  const [profile, setProfile] = useState<DashboardProfile>("wide");
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const apply = () => setProfile(mq.matches ? "wide" : "narrow");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  /**
   * The profile a WRITE is filed under, read from the viewport at the moment of saving rather
   * than taken from the state above.
   *
   * Belt and braces, and worth it here. The state depends on a `change` event arriving; if one
   * were ever missed the arrangement would be silently saved against the *other* device — which
   * is precisely the thing this feature exists to prevent, and it would look like the phone
   * layout mysteriously reordering the desktop. Reading the query costs nothing and cannot be
   * stale. (State still drives RENDERING, which must stay stable across a render pass.)
   */
  const writeProfile = useCallback(
    (): DashboardProfile => (window.matchMedia(WIDE_QUERY).matches ? "wide" : "narrow"),
    [],
  );

  const arrangement = arrangements[profile];
  const [order, setOrder] = useState(() => arrangements.wide.order.map((i) => key(i.kind, i.id)));
  /**
   * Where every item sits, as grid cells (free placement, 1.8.0).
   *
   * Separate from `order`, which is now only the DOM order — it decides tab order and nothing
   * visual, because every item is placed explicitly. That separation is what makes dragging calm:
   * moving one item changes one entry here and **nothing else moves at all**, where the previous
   * ordering model had to reflow every item after the one you touched.
   */
  const [placements, setPlacements] = useState<Map<string, Placement>>(
    () => new Map(Object.entries(arrangements.wide.placements)),
  );
  const [editing, setEditing] = useState(false);
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

  // Re-seed when the profile changes: each profile is its own arrangement, and the optimistic
  // order held here belongs to the one we were showing.
  /*
   * Re-seed whenever the SERVER's arrangement changes, not only when the profile does.
   *
   * Each profile is its own arrangement, so switching between them obviously has to re-seed. But
   * the server's placements also change when an item is resized, reset, or added — and holding
   * them in state alone meant those never reached the screen: a resize wrote to the database,
   * revalidated, and the grid carried on rendering the size it had cached at mount. Comparing the
   * serialised placements catches every case with one rule, and a drag's own optimistic update is
   * safe because it produces the same string the server sends back.
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
   * Save the WHOLE arrangement, not just the item that moved.
   *
   * Most items have no stored position until somebody drags something — they are packed into the
   * first free space on read — so writing only the moved one would leave every other item free to
   * shuffle the next time anything was added or removed. Writing them all freezes what the user
   * is looking at, which is the only reading of "I put it there" that survives the next change.
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
   * Where an item would land, given how far it has been dragged. `null` when that cell is not
   * available — off the grid, or already occupied.
   *
   * The candidate is computed from the item's ORIGIN plus the distance travelled, in whole cells,
   * rather than from wherever the pointer happens to be. That keeps the grab point under your
   * finger: pick a tile up by its corner and it stays held by that corner, instead of jumping so
   * that the pointer sits at its centre.
   */
  function candidateCell(
    from: Placement,
    dx: number,
    dy: number,
    current: Map<string, Placement>,
    self: string,
  ): Placement | null {
    const metrics = cellMetrics();
    if (!metrics) return null;
    const col = from.col + Math.round(dx / metrics.colWidth);
    const row = from.row + Math.round(dy / metrics.rowHeight);
    if (col < 0 || col + from.width > metrics.columns) return null;
    if (row < 0 || row > MAX_ROWS) return null;

    const candidate = { col, row, width: from.width, height: from.height };
    for (const [otherKey, other] of current) {
      if (otherKey === self) continue;
      if (overlaps(candidate, other)) return null;
    }
    return candidate;
  }

  /*
   * Pointer-driven dragging, onto a CELL (free placement, 1.8.0).
   *
   * Owner: *"I want to be able to arrange the grid in any way I want… one icon at the top, and
   * one at the bottom, not directly next to each other."* That is not expressible as an ordering,
   * so the drag no longer asks "which item am I over, and should we swap" — it asks "which cell
   * am I over, and is it free". An item is simply put where you put it, gaps and all.
   *
   * It also answers *"still doesn't feel super natural"* about the previous model, and for a
   * structural reason rather than a cosmetic one: swapping meant every item after the one you
   * held had to shuffle along as you moved, so the grid churned continuously under a gesture that
   * had not finished. Here **nothing else moves at all** — the held item follows the pointer, the
   * rest stay exactly where they are, and the layout changes once, when you let go.
   *
   * The last valid cell is kept while you are over an occupied one, so dragging *across* a
   * neighbour to reach the space beyond it works rather than being refused halfway.
   */
  function beginDrag(k: string, e: React.PointerEvent) {
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = placements.get(k);
    if (!origin) return;

    /*
     * A plain closure variable, not state or a ref: it has to be readable synchronously inside
     * `pointermove`, state would be a render behind, and a ref written during render is both
     * illegal and a lie about where the truth lives. `beginDrag` is defined during render, so it
     * closes over the arrangement as it was at pointerdown — exactly what the user grabbed.
     */
    let working = placements;

    setDragKey(k);
    setDragDelta({ x: 0, y: 0 });

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      const next = candidateCell(origin, dx, dy, working, k);
      if (next) {
        const at = working.get(k);
        if (!at || at.col !== next.col || at.row !== next.row) {
          working = new Map(working).set(k, next);
          setPlacements(working);
        }
      }

      /*
       * The transform is the REMAINDER, not the whole pointer delta.
       *
       * The item's own grid cell now changes as you drag, so it has already moved by whole cells
       * on its own. Adding the full pointer distance on top of that moved it twice — the owner:
       * *"it feels like they move double the distance of the cursor"*. Subtracting the distance
       * already covered by the cell change leaves only the sub-cell remainder, so the item sits
       * exactly under the pointer while still snapping to the grid.
       */
      const metrics = cellMetrics();
      const at = working.get(k) ?? origin;
      const cellDx = metrics ? (at.col - origin.col) * metrics.colWidth : 0;
      const cellDy = metrics ? (at.row - origin.row) * metrics.rowHeight : 0;
      setDragDelta({ x: dx - cellDx, y: dy - cellDy });
    };

    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setDragKey(null);
      setDragDelta({ x: 0, y: 0 });
      commit(working); // ONE write, for where it actually ended up
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  /*
   * FLIP, so the items that move actually glide.
   *
   * CSS grid does not animate reflow — a reordered item simply appears in its new cell, which is
   * what "clunky" meant. So: remember where everything was, let React re-render, then put each
   * moved item back where it started with a transform and release it. The browser animates the
   * release, and nothing about the layout itself is faked.
   *
   * The dragged item is excluded — it is already following the pointer, and animating it too
   * would fight that.
   */
  const prevRects = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
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
         * Don't animate a journey nobody could follow.
         *
         * Inserting a wide widget pushes everything after it onto the next row, so a tile can
         * legitimately move most of a screen. Inverting that puts it at its old position — often
         * outside the viewport — and animates it back in, which reads as the tile having vanished
         * and then flown across the page rather than as anything moving. Past a screen's worth,
         * letting it simply be in its new place is calmer and more honest about what happened.
         */
        if (Math.abs(dx) > window.innerWidth || Math.abs(dy) > window.innerHeight) return;
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        /*
         * Release SYNCHRONOUSLY, after forcing a style flush — not from a `requestAnimationFrame`
         * callback.
         *
         * rAF does not run in a backgrounded or hidden tab, and a rAF that never fires leaves the
         * inverted transform on the element permanently: the item sits visibly displaced, and —
         * worse — `getBoundingClientRect` then reports the wrong position, so the next drag
         * hit-tests against geometry that no longer exists. That is not hypothetical; it is what
         * this code did, and it scrambled the order on every drag.
         *
         * Reading `offsetWidth` forces the browser to apply the inverted transform before the
         * next two lines overwrite it, which is the whole reason the rAF was there. Doing it this
         * way the animation still runs when frames are being produced, and when they aren't the
         * element simply lands in the right place with no animation — correct either way.
         */
        void el.offsetWidth;
        el.style.transition = "transform 180ms cubic-bezier(0.2, 0, 0.2, 1)";
        el.style.transform = "";
      });
    }
    prevRects.current = now;
  }, [placements, dragKey]);

  /**
   * Move one cell. Drives the arrange buttons — which are the keyboard and touch path, and the
   * only way to arrange for anyone who can't drag at all.
   *
   * Four directions now rather than "earlier/later": once a position is a cell rather than a
   * place in a queue, moving something *later* has no meaning, and up and down are exactly what
   * free placement makes possible.
   */
  function nudge(k: string, direction: "left" | "right" | "up" | "down") {
    const from = placements.get(k);
    if (!from) return;
    const metrics = cellMetrics();
    const dx = direction === "left" ? -1 : direction === "right" ? 1 : 0;
    const dy = direction === "up" ? -1 : direction === "down" ? 1 : 0;
    const next = { col: from.col + dx, row: from.row + dy, width: from.width, height: from.height };
    if (next.col < 0 || next.row < 0) return;
    if (metrics && next.col + next.width > metrics.columns) return;
    if (next.row > MAX_ROWS) return;
    // Same rule as the drag: land only where there is room.
    for (const [otherKey, other] of placements) {
      if (otherKey === k) continue;
      if (overlaps(next, other)) return;
    }
    commit(new Map(placements).set(k, next));
  }

  /**
   * Measure a cell from the live grid rather than hardcoding it. The column count changes with
   * the breakpoint and the row height is now derived from it, so a duplicated constant here
   * would silently disagree with what is on screen.
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
   * SQUARE CELLS — the row height tracks the measured column width (owner, 2026-07-27).
   *
   * A fixed row height could never be square, because the columns are fluid: at one window
   * width a 1×1 was a squat landscape box, at another it was portrait, and no combination of
   * spans reliably produced a square. The owner's ask was exactly that — "small or large,
   * square, rectangle, whatever I want" — and that only works if one unit is one unit in both
   * directions.
   *
   * It has to be measured rather than declared: CSS can size a row from its content or from a
   * fixed value, but not from the width of a column it doesn't know. Recomputed on resize via
   * ResizeObserver, which also covers the window changing without a `resize` event — the exact
   * gap that made the profile switch untestable in the browser harness.
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
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className={editing ? "btn btn-primary !py-1.5 text-sm" : "btn btn-ghost !py-1.5 text-sm"}
          aria-pressed={editing}
        >
          {editing ? "Done arranging" : "Arrange"}
        </button>
      </div>

      {editing && (
        <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
          Drag anything anywhere — leave gaps if you want to. The arrows move one square at a time,
          and the bottom-right corner resizes.{" "}
          {profile === "narrow"
            ? "Saved for narrow screens only — your desktop layout is untouched."
            : "Saved for wide screens only — your phone layout is untouched."}
        </p>
      )}

      {/*
        The row track is FIXED (BUG-59) and SQUARE (owner, 2026-07-27).

        Fixed, because a growable track sizes itself to its content and an item spanning several
        rows spreads its content across all of them — so resizing one item silently re-sized the
        rows it shared with a neighbour, and the neighbour moved. Content-sized tracks cannot
        also be independent of content, and independence is what matters here.

        Square, because the columns are fluid: with a constant row height a 1×1 was landscape at
        one window width and portrait at another, and no combination of spans gave a reliable
        square. `rowPx` is the measured column width, so one unit is one unit in both directions
        and N×N is genuinely a square.
      */}
      <div
        ref={gridRef}
        className="grid grid-cols-[repeat(6,minmax(0,1fr))] gap-2 lg:grid-cols-[repeat(18,minmax(0,1fr))]"
        style={{ gridAutoRows: `${rowPx ?? FALLBACK_ROW_PX}px` }}
      >
        {ordered.map((item) => {
          const k = key(item.kind, item.id);
          const fallback = DEFAULT_SPAN[profile][item.kind];
          // Every item has a cell — the server packs anything without a stored one, so there is
          // no auto-placed case to fall back to. The default span still covers an item that
          // appeared between the server render and this one.
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
              onNudge={(dir) => nudge(k, dir)}
            >
              {item.node}
            </DashboardFrame>
          );
        })}
      </div>
    </>
  );
}
