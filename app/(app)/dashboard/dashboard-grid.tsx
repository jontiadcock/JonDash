"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { DashboardFrame } from "./dashboard-frame";
import { placeItemsAction } from "./layout-actions";
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
 * How still the pointer must be before the board rearranges around it.
 *
 * Long enough that ordinary hand movement never triggers it — a drag is a continuous stream of
 * `pointermove`, so anything much shorter fires mid-gesture and reintroduces the churn this
 * exists to remove. Short enough that pausing over a spot answers "what would happen here?"
 * while you are still asking. A drop always resolves regardless, so nothing depends on waiting.
 */
const SETTLE_MS = 220;

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
  function candidateCell(from: Placement, dx: number, dy: number): Placement | null {
    const metrics = cellMetrics();
    if (!metrics) return null;
    const col = from.col + Math.round(dx / metrics.colWidth);
    const row = from.row + Math.round(dy / metrics.rowHeight);
    // Only the edges of the grid constrain it now. Landing on something occupied is no longer
    // refused — `displaceFor` moves whatever is in the way. See the note in beginDrag.
    if (col < 0 || col + from.width > metrics.columns) return null;
    if (row < 0 || row > MAX_ROWS) return null;
    return { col, row, width: from.width, height: from.height };
  }

  /*
   * Pointer-driven dragging, onto a CELL (free placement, 1.8.0).
   *
   * Owner: *"I want to be able to arrange the grid in any way I want… one icon at the top, and
   * one at the bottom, not directly next to each other."* That is not expressible as an ordering,
   * so the drag no longer asks "which item am I over, and should we swap" — it asks "which cell
   * am I over, and is it free". An item is simply put where you put it, gaps and all.
   *
   * It also answers *"still doesn't feel super natural"* about the ordering model that preceded
   * it, and for a structural reason rather than a cosmetic one: swapping meant every item after
   * the one you held had to shuffle along as you moved, so the grid churned continuously under a
   * gesture that had not finished.
   *
   * **Dropping onto an occupied cell now moves what is in the way** (owner, 2026-07-28), rather
   * than being refused. Only the items actually overlapped are touched, each going to its nearest
   * free spot — see `displaceFor`. Everything else keeps its position exactly, which is what stops
   * a shuffle from tidying away the deliberate gaps free placement exists to allow.
   *
   * **Every frame is resolved against `base` — the layout as it was at pointerdown — not against
   * the running result.** Applied cumulatively, dragging across a full board would push the same
   * items over and over and scatter it; applied to the original, the shuffle is stable while you
   * hover and undoes itself exactly if you move back.
   */
  function beginDrag(k: string, e: React.PointerEvent) {
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = placements.get(k);
    if (!origin) return;

    /*
     * `base` is the board as it was at pointerdown and is never written to; `working` is what the
     * screen currently shows. Both are plain closure variables rather than state or a ref: they
     * have to be readable synchronously inside `pointermove`, state would be a render behind, and
     * a ref written during render is both illegal and a lie about where the truth lives.
     * `beginDrag` is defined during render, so it closes over exactly what the user grabbed.
     */
    const base = placements;
    let working = placements;
    let lastDx = 0;
    let lastDy = 0;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    setDragKey(k);
    setDragDelta({ x: 0, y: 0 });

    /**
     * How far the tile must sit from its own cell to stay under the pointer.
     *
     * The tile's cell only changes when the board is resolved, so between resolves this grows to
     * the full pointer distance and the tile tracks the cursor exactly. Right after a resolve it
     * collapses to the sub-cell remainder. Both are the same subtraction, which is why the tile
     * never jumps: whatever the cell has done, the offset accounts for it.
     *
     * A `const` arrow rather than a `function` declaration on purpose — a hoisted declaration is
     * not covered by the `if (!origin) return` guard above it, so TypeScript rightly refuses to
     * narrow `origin` inside one.
     */
    const remainder = (dx: number, dy: number) => {
      const metrics = cellMetrics();
      const at = working.get(k) ?? origin;
      const cellDx = metrics ? (at.col - origin.col) * metrics.colWidth : 0;
      const cellDy = metrics ? (at.row - origin.row) * metrics.rowHeight : 0;
      return { x: dx - cellDx, y: dy - cellDy };
    };

    /**
     * Work out the board for where the pointer is now, and show it.
     *
     * Called when the pointer PAUSES or when it is released — never continuously. See `move`.
     */
    const resolve = () => {
      const next = candidateCell(origin, lastDx, lastDy);
      if (!next) return;
      const at = working.get(k);
      if (at && at.col === next.col && at.row === next.row) return;
      // Resolved against BASE, not against `working` — so the shuffle undoes itself when you move
      // back, instead of accumulating as you cross the board.
      const columns = cellMetrics()?.columns ?? GEOMETRY[profile].columns;
      working = displaceFor(new Map(base).set(k, next), k, columns);
      setPlacements(working);
      // The tile has just snapped to a cell, so its offset from the pointer changed. Recompute it
      // here or it visibly jumps by however far the cell moved.
      setDragDelta(remainder(lastDx, lastDy));
    };

    /*
     * **Nothing shuffles while the pointer is moving** (owner, 2026-07-28: *"make it calculate on
     * drop, or if someone stops moving the cursor"*).
     *
     * Recomputing on every cell change was genuinely erratic, and their read of it — *"almost as
     * if it is calculating too fast"* — was the right diagnosis. Two causes compounding: a target
     * cell derived by rounding flips back and forth on the least jitter near a boundary, and each
     * flip can send a displaced tile somewhere quite different, since the nearest free space for
     * one anchor cell need not be adjacent to the nearest free space for the next. Every one of
     * those changes then animated, so several were in flight at once.
     *
     * Waiting for a pause fixes the cause rather than damping the symptom: a shuffle now only
     * happens at a moment the user has stopped and can see it. It doubles as a preview — hesitate
     * over a spot and the board shows you what dropping there would do.
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
       * **The dropped tile is not animated at all** — it snaps into its cell.
       *
       * Forgetting its previous rect is what does that: the FLIP effect below iterates
       * `prevRects`, so a key that isn't there simply isn't animated, and the pass right
       * afterwards records its settled position for next time.
       *
       * Three attempts at animating this taught the lesson. A drop is the one moment when
       * *several* things move the tile at once — the drag transform comes off, the layout effect
       * fires for the local update, and the server round-trip fires it again — and each one
       * computes its own idea of where the tile was coming from. Measured on a real drop: the
       * tile flashed to (1010, 244), then to (−108, 715), i.e. off-screen, before easing back in
       * over 200ms. That is the owner's *"it studders briefly when dropped"*, and their earlier
       * *"bounce in a random direction"* was the same fault less tamed.
       *
       * There is nothing to animate anyway. The tile is already under the pointer, and its cell
       * is at most half a cell away, because the drag transform is only the sub-cell remainder.
       * Animating a journey that short is all risk and no benefit.
       *
       * The tiles that were SHOVED still animate — they genuinely move, from a position nothing
       * else is competing to change, and that movement is the point of the shuffle.
       */
      prevRects.current.delete(k);

      /*
       * Ask the layout effect to take the drag transform off WITHOUT animating it.
       *
       * **This is what the stutter actually was, and it was never FLIP** — three fixes aimed at
       * the wrong thing before a probe caught it. The frame carries Tailwind's `transition` class,
       * which includes `transform`. While dragging, the tile is offset by an inline transform; on
       * release React removes that property, and the class dutifully **animates the removal**. So
       * the tile snapped to its new cell and then slid in from wherever it had been held.
       * Measured: the cell changed at 15ms with the inline style already gone, while the computed
       * transform was still -340px, easing to zero over the next 180ms.
       *
       * **Why a note for later rather than doing it here.** Clearing the transform in this handler
       * does stop the slide, but React has not yet committed the new cell — so for one frame the
       * tile paints at the cell it came FROM, which is a flash in the other direction. The layout
       * effect runs after the DOM has moved and before the browser paints, which is the one moment
       * both facts are true at once.
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
  /** The tile just dropped, if any — its drag transform must come off without animating. */
  const settlingRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    /*
     * A dropped tile lands; it does not glide in.
     *
     * This runs after React has moved the tile to its new cell and removed the inline drag
     * transform, but BEFORE the browser paints — the only moment when both the new position and
     * the absence of the transform are true together. Suppressing the transition and forcing a
     * flush here makes "no transform" a fact the browser commits rather than a destination it
     * animates towards. Doing it any earlier paints one frame at the old cell instead.
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

        /*
         * Hand the element back to its stylesheet once the settle finishes.
         *
         * Both properties were being left inline forever. The stranded `transition` then governed
         * everything else the element does — most visibly the hover lift, which is applied by a
         * class and was being re-timed to 180ms of FLIP's easing. Since the pointer is by
         * definition over a tile you have just dropped, that lift fires during the settle, and
         * the two moving together is part of what read as a bounce.
         *
         * `once` so the listener cannot accumulate across drags, and it is registered before the
         * transition can finish, so it cannot be missed.
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
   * The one-cell nudge that drove the ←↑↓→ buttons is gone with them (owner, 2026-07-28). Removed
   * rather than left unused: an exported-looking helper with no caller reads as something that
   * still works, and the next person would wire a button to it without knowing why it went.
   *
   * It is a dozen clicks to cross an eighteen-column grid, which is what made it useless once a
   * drag could place an item anywhere in one gesture.
   */

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
            >
              {item.node}
            </DashboardFrame>
          );
        })}
      </div>
    </>
  );
}
