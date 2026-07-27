"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { WidgetFrame } from "./widget-frame";
import { reorderWidgetsAction } from "./layout-actions";

export type WidgetItem = {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Where clicking the widget goes, or null when the module ships no page of its own. */
  href: string | null;
  node: React.ReactNode;
};

/** Measured geometry of one grid cell, so a pointer drag can be turned into span units. */
export type CellMetrics = { colWidth: number; rowHeight: number; columns: number };

/**
 * The dashboard's module-widget grid.
 *
 * **Two modes, and that is the whole design (CORE-08).** Normally a widget is simply a thing
 * you click to open — no hover-revealed chrome sitting on top of the module's own UI, which
 * is what put the edit controls over a module's "Open" button (BUG-53). Arranging is a rare,
 * deliberate act, so it gets an explicit mode with its controls always visible rather than
 * revealed by a hover that a touch screen cannot perform.
 *
 * Each widget's rendered output arrives as `node`: it is a server component (it may query,
 * and must not become client code), and passing it through as a prop keeps it that way.
 *
 * Reordering is optimistic — the grid rearranges immediately and the save happens behind it,
 * because waiting for a round-trip before the tile moves feels broken. A failed save is put
 * right by the next server render.
 */
export function WidgetGrid({ items }: { items: WidgetItem[] }) {
  const [order, setOrder] = useState<string[]>(() => items.map((i) => i.id));
  const [editing, setEditing] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const gridRef = useRef<HTMLDivElement>(null);

  // What's being dragged is held in a ref as well as state. The ref is the source of truth
  // for the drop, because `drop` can arrive in the same batch as `dragstart` — the state
  // captured in the handler's closure would still be null and the drop would be lost.
  const draggingRef = useRef<string | null>(null);

  function beginDrag(id: string) {
    draggingRef.current = id;
    setDraggingId(id);
  }

  function endDrag() {
    draggingRef.current = null;
    setDraggingId(null);
    setOverId(null);
  }

  // No effect syncs `order` back to the server's: the page keys this component on the SET of
  // visible module ids, so installing/enabling/removing one remounts the grid and re-seeds
  // the order, while a mere reorder (same set) leaves it mounted and keeps the optimistic
  // arrangement. Cheaper than a sync effect, and the React Compiler rejects setState there.
  const byId = new Map(items.map((i) => [i.id, i]));
  const ordered = order.map((id) => byId.get(id)).filter((i): i is WidgetItem => !!i);

  function commit(next: string[]) {
    setOrder(next);
    startTransition(() => void reorderWidgetsAction(next));
  }

  function handleDrop(targetId: string) {
    const sourceId = draggingRef.current;
    endDrag();
    if (!sourceId || sourceId === targetId) return;
    const next = [...order];
    const from = next.indexOf(sourceId);
    const to = next.indexOf(targetId);
    if (from === -1 || to === -1) return;
    next.splice(to, 0, ...next.splice(from, 1)); // move, don't swap
    commit(next);
  }

  /** Move one place. Drives the edit-mode buttons, which are also the keyboard path. */
  function nudge(id: string, direction: "up" | "down") {
    const next = [...order];
    const from = next.indexOf(id);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from === -1 || to < 0 || to >= next.length) return;
    [next[from], next[to]] = [next[to], next[from]];
    commit(next);
  }

  /**
   * Measure one cell from the live grid rather than hardcoding it.
   *
   * Corner-drag resize has to convert a pixel delta into span units, and the column count
   * changes with the breakpoint while the row height comes from `auto-rows`. Reading both off
   * the rendered element is the only version that stays correct when either changes — a
   * duplicated constant here would silently disagree with the CSS the first time it moved.
   */
  const cellMetrics = useCallback((): CellMetrics | null => {
    const el = gridRef.current;
    if (!el) return null;
    const cs = getComputedStyle(el);
    const cols = cs.gridTemplateColumns.split(" ").filter(Boolean);
    const columns = Math.max(1, cols.length);
    const colGap = parseFloat(cs.columnGap) || 0;
    const rowGap = parseFloat(cs.rowGap) || 0;
    const colWidth = (el.clientWidth - colGap * (columns - 1)) / columns + colGap;
    // Row height comes from the first track; `auto-rows` makes them uniform unless a widget
    // has grown past the base, which is exactly when a measured value beats an assumed one.
    const firstRow = parseFloat(cs.gridAutoRows) || 176;
    return { colWidth, rowHeight: firstRow + rowGap, columns };
  }, []);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Modules</h2>
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
          Move widgets with the arrows, or drag the bottom-right corner to resize. Changes save
          as you make them.
        </p>
      )}

      {/*
        `auto-rows-[minmax(11rem,auto)]` is what makes the Height setting mean anything (BUG-54).

        Without a row track, implicit rows are content-sized: each widget generates its own row,
        and a `grid-row: span 2` then spans two rows that have no independent height to add — so
        the setting saved, re-rendered, and moved nothing at all.

        `minmax(base, auto)` rather than a fixed height on purpose: a span now multiplies a real
        11rem base, while a widget whose content genuinely needs more room still grows instead of
        being clipped. Clipping a module's own UI to enforce a tidy grid is the worse trade.
      */}
      <div
        ref={gridRef}
        className="grid grid-cols-1 gap-4 auto-rows-[minmax(11rem,auto)] sm:grid-cols-2 lg:grid-cols-3"
      >
        {ordered.map((item, index) => (
          <WidgetFrame
            key={item.id}
            moduleId={item.id}
            name={item.name}
            href={item.href}
            width={item.width}
            height={item.height}
            editing={editing}
            isFirst={index === 0}
            isLast={index === ordered.length - 1}
            dragging={draggingId === item.id}
            dropTarget={overId === item.id && draggingId !== null && draggingId !== item.id}
            cellMetrics={cellMetrics}
            onDragStartWidget={() => beginDrag(item.id)}
            onDragEnterWidget={() => setOverId(item.id)}
            onDragEndWidget={endDrag}
            onDropWidget={() => handleDrop(item.id)}
            onNudge={(dir) => nudge(item.id, dir)}
          >
            {item.node}
          </WidgetFrame>
        ))}
      </div>
    </>
  );
}
