"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { DashboardFrame } from "./dashboard-frame";
import { reorderItemsAction } from "./layout-actions";
import type { DashboardKind, DashboardProfile } from "@/lib/dashboard/layout";

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
 * **The grid is `grid-cols-2 lg:grid-cols-6`, and that boundary IS the profile boundary.**
 * Two column counts, two saved arrangements, one rule — so what you rearrange on a phone is
 * always the thing being saved for phones. Six is a common denominator rather than either of
 * the old counts: a tile at 1 unit lands near its old 5-across and a widget at 2 lands exactly
 * on its old 3-across, so nobody's dashboard is rearranged by the merge itself.
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
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const gridRef = useRef<HTMLDivElement>(null);

  // Re-seed when the profile changes: each profile is its own arrangement, and the optimistic
  // order held here belongs to the one we were showing.
  const [seededFor, setSeededFor] = useState<DashboardProfile>("wide");
  if (seededFor !== profile) {
    setSeededFor(profile);
    setOrder(arrangement.order.map((i) => key(i.kind, i.id)));
  }

  // The drop reads from a ref as well as state: `drop` can arrive in the same batch as
  // `dragstart`, when the state captured in the handler's closure would still be null.
  const draggingRef = useRef<string | null>(null);

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

  function handleDrop(targetKey: string) {
    const sourceKey = draggingRef.current;
    draggingRef.current = null;
    setDraggingKey(null);
    setOverKey(null);
    if (!sourceKey || sourceKey === targetKey) return;
    const next = [...order];
    const from = next.indexOf(sourceKey);
    const to = next.indexOf(targetKey);
    if (from === -1 || to === -1) return;
    next.splice(to, 0, ...next.splice(from, 1)); // move, don't swap
    commit(next);
  }

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
        className="grid grid-cols-2 gap-4 lg:grid-cols-6"
        style={{ gridAutoRows: `${rowPx ?? FALLBACK_ROW_PX}px` }}
      >
        {ordered.map((item, index) => {
          const k = key(item.kind, item.id);
          const span = arrangement.spans[k] ?? { width: item.kind === "link" ? 1 : 2, height: item.kind === "link" ? 1 : 2 };
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
              dragging={draggingKey === k}
              dropTarget={overKey === k && draggingKey !== null && draggingKey !== k}
              cellMetrics={cellMetrics}
              onDragStartItem={() => {
                draggingRef.current = k;
                setDraggingKey(k);
              }}
              onDragEnterItem={() => setOverKey(k)}
              onDragEndItem={() => {
                draggingRef.current = null;
                setDraggingKey(null);
                setOverKey(null);
              }}
              onDropItem={() => handleDrop(k)}
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
