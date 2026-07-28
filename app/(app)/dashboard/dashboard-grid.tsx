"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { DashboardFrame } from "./dashboard-frame";
import { reorderItemsAction } from "./layout-actions";
// `geometry`, not `layout` — the latter is server-only (Prisma), and this is a client component.
import { DEFAULT_SPAN, type DashboardKind, type DashboardProfile } from "@/lib/dashboard/geometry";

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
  /** Keyed `kind:id`. */
  spans: Record<string, Span>;
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
  const [seededFor, setSeededFor] = useState<DashboardProfile>("wide");
  if (seededFor !== profile) {
    setSeededFor(profile);
    setOrder(arrangement.order.map((i) => key(i.kind, i.id)));
  }

  const byKey = new Map(items.map((i) => [key(i.kind, i.id), i]));
  const ordered = order.map((k) => byKey.get(k)).filter((i): i is DashboardItem => !!i);

  function commit(next: string[]) {
    setOrder(next);
    const payload = next
      .map((k) => byKey.get(k))
      .filter((i): i is DashboardItem => !!i)
      .map((i) => ({ kind: i.kind as string, id: i.id }));
    startTransition(() => void reorderItemsAction(writeProfile(), payload));
  }

  /*
   * Pointer-driven dragging.
   *
   * The item follows the cursor and everything else moves out of its way WHILE you are still
   * holding it — which is the whole difference from the native drag-and-drop this replaced. That
   * API paints its own drag image (the grey box with a URL in it), cannot be styled, ignores
   * touch entirely, and only reports coarse enter/leave events, so there is nothing to reflow
   * against until the moment you let go.
   *
   * The order is updated live but NOT saved until the pointer comes up: dragging across six
   * items would otherwise fire six writes, and the intermediate arrangements were never
   * something the user asked for.
   */
  function beginDrag(k: string, e: React.PointerEvent) {
    const startX = e.clientX;
    const startY = e.clientY;

    /*
     * The working order is a plain closure variable, not state or a ref.
     *
     * It has to be readable synchronously inside `pointermove` — state would be a render behind,
     * and a ref written during render is both illegal and a lie about where the truth lives.
     * `beginDrag` is defined during render, so it closes over the order as it was at pointerdown,
     * which is exactly the arrangement the user grabbed.
     */
    let working = order;

    setDragKey(k);
    setDragDelta({ x: 0, y: 0 });

    const move = (ev: PointerEvent) => {
      setDragDelta({ x: ev.clientX - startX, y: ev.clientY - startY });

      /*
       * Hit-test against each item's LAYOUT box, not its painted rectangle.
       *
       * The question being asked is "which cell of the grid is the pointer over". A painted
       * rectangle answers a different question, and the two disagree for exactly as long as a
       * FLIP animation is running: `getBoundingClientRect` includes the transform, so a
       * mid-flight item reports a position somewhere between the cell it left and the cell it is
       * going to. Drag faster than 180ms and every subsequent hit test aims at a rectangle that
       * is nowhere in particular — which scrambled the order rather than merely mis-aiming.
       *
       * `offsetLeft`/`offsetTop` are immune to transforms, so they always give the real cell.
       * They are measured from the nearest positioned ancestor, which the grid and its children
       * share, so subtracting the grid's own offset gives a common origin — and the pointer is
       * put in that same space via the grid's rect, which is safe because the GRID is never
       * transformed, only the items inside it.
       */
      const gridEl = gridRef.current;
      if (!gridEl) return;
      const gr = gridEl.getBoundingClientRect();
      const px = ev.clientX - gr.left;
      const py = ev.clientY - gr.top;

      let targetKey: string | null = null;
      let targetCentre = { x: 0, y: 0 };
      for (const [otherKey, el] of frames.current) {
        if (otherKey === k) continue;
        const left = el.offsetLeft - gridEl.offsetLeft;
        const top = el.offsetTop - gridEl.offsetTop;
        if (px >= left && px <= left + el.offsetWidth && py >= top && py <= top + el.offsetHeight) {
          targetKey = otherKey;
          targetCentre = { x: left + el.offsetWidth / 2, y: top + el.offsetHeight / 2 };
          break;
        }
      }
      if (!targetKey) return;

      const from = working.indexOf(k);
      const to = working.indexOf(targetKey);
      if (from === -1 || to === -1 || from === to) return;

      /*
       * Swap only once the pointer is PAST the target's centre, in the direction of the move.
       *
       * Touching any part of a target used to be enough, and a module widget is four times the
       * area of a service tile — so brushing one edge of a big widget reordered the whole grid,
       * and because a wide item that no longer fits its row pushes everything after it onto the
       * next row, small tiles visibly flew a long way for a gesture that had barely started.
       * The owner: *"other ones will vanish off screen as if the one I'm moving has forced them
       * off, if I'm moving a big tile."*
       *
       * The axis is chosen by where the target actually sits rather than fixed: items on the same
       * row are passed horizontally, items on another row vertically.
       */
      const sameRow = Math.abs(targetCentre.y - py) < Math.abs(targetCentre.x - px);
      const forward = to > from;
      const pastCentre = sameRow
        ? forward
          ? px > targetCentre.x
          : px < targetCentre.x
        : forward
          ? py > targetCentre.y
          : py < targetCentre.y;
      if (!pastCentre) return;

      const next = [...working];
      next.splice(to, 0, ...next.splice(from, 1)); // move, don't swap
      working = next;
      setOrder(next);
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
  }, [order, dragKey]);

  /** Move one place. Drives the arrange buttons, which are also the keyboard and touch path. */
  function nudge(k: string, direction: "up" | "down") {
    const next = [...order];
    const from = next.indexOf(k);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from === -1 || to < 0 || to >= next.length) return;
    [next[from], next[to]] = [next[to], next[from]];
    commit(next);
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
          {profile === "narrow"
            ? "Move things with the arrows. This arrangement is saved for narrow screens only — your desktop layout is untouched."
            : "Move things with the arrows, or drag the bottom-right corner to resize. Saved for wide screens only; your phone layout is untouched."}
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
        {ordered.map((item, index) => {
          const k = key(item.kind, item.id);
          const fallback = DEFAULT_SPAN[profile][item.kind];
          const span = arrangement.spans[k] ?? fallback;
          return (
            <DashboardFrame
              key={k}
              kind={item.kind}
              refId={item.id}
              name={item.name}
              href={item.href}
              external={item.external}
              writeProfile={writeProfile}
              width={span.width}
              height={span.height}
              editing={editing}
              isFirst={index === 0}
              isLast={index === ordered.length - 1}
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
