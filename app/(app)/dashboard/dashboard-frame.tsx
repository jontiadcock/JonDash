"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setItemSizeAction, resetItemAction } from "./layout-actions";
import type { CellMetrics } from "./dashboard-grid";
import type { DashboardKind, DashboardProfile } from "@/lib/dashboard/layout";

const MIN_SPAN = 1;
const MAX_HEIGHT = 6;
const clampW = (n: number, columns: number) => Math.min(columns, Math.max(MIN_SPAN, n));
const clampH = (n: number) => Math.min(MAX_HEIGHT, Math.max(MIN_SPAN, n));

/**
 * Wraps one dashboard item — a service tile or a module widget (CORE-11).
 *
 * **Normally there is no chrome at all.** The item is a thing you click, and nothing of ours
 * is painted over it. The previous design revealed controls on hover at `right-2 top-2`,
 * exactly where a module puts its own "Open" (BUG-53) — and hover cannot happen on a touch
 * screen at all. Arranging is an explicit mode instead, with its controls always visible.
 *
 * The grid span is an inline style, not a Tailwind class: class names built at runtime aren't
 * seen by the JIT compiler and would silently do nothing.
 */
export function DashboardFrame({
  kind,
  refId,
  name,
  href,
  external,
  writeProfile,
  width,
  height,
  editing,
  isFirst,
  isLast,
  dragging,
  dropTarget,
  cellMetrics,
  onDragStartItem,
  onDragEnterItem,
  onDragEndItem,
  onDropItem,
  onNudge,
  children,
}: {
  kind: DashboardKind;
  refId: string;
  name: string;
  href: string | null;
  external: boolean;
  /** Reads the live viewport at save time — see the note in dashboard-grid.tsx. Never a
   *  stored value, so a missed media-query event can't file a change against the wrong device. */
  writeProfile: () => DashboardProfile;
  width: number;
  height: number;
  editing: boolean;
  isFirst: boolean;
  isLast: boolean;
  dragging: boolean;
  dropTarget: boolean;
  cellMetrics: () => CellMetrics | null;
  onDragStartItem: () => void;
  onDragEnterItem: () => void;
  onDragEndItem: () => void;
  onDropItem: () => void;
  onNudge: (direction: "up" | "down") => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // While a corner drag is in flight the frame previews the size it would become, so the grid
  // reflows under the pointer instead of jumping only once you let go.
  const [preview, setPreview] = useState<{ w: number; h: number } | null>(null);
  // State, not a ref: it decides whether the frame is `draggable`, so it has to cause a
  // re-render. A ref would leave HTML5 drag armed during a corner resize.
  const [resizing, setResizing] = useState(false);

  const w = preview?.w ?? width;
  const h = preview?.h ?? height;

  const run = (fn: () => Promise<void>) => startTransition(() => void fn());

  /**
   * Turn a corner drag into span units. Pointer events rather than HTML5 drag: this needs a
   * live position on every move, and a drag image would be nonsense for a resize.
   * `setPointerCapture` keeps the moves coming once the pointer leaves the handle.
   */
  function startResize(e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    const metrics = cellMetrics();
    if (!metrics) return;

    setResizing(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = width;
    const startH = height;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const nextW = clampW(startW + Math.round((ev.clientX - startX) / metrics.colWidth), metrics.columns);
      const nextH = clampH(startH + Math.round((ev.clientY - startY) / metrics.rowHeight));
      setPreview((p) => (p && p.w === nextW && p.h === nextH ? p : { w: nextW, h: nextH }));
    };

    const finish = (ev: PointerEvent) => {
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      setResizing(false);
      setPreview((p) => {
        if (p && (p.w !== startW || p.h !== startH)) {
          run(() => setItemSizeAction(kind, refId, writeProfile(), p.w, p.h));
        }
        // Hold the preview until the server render lands, or the item snaps back for a frame
        // and reads as the save having failed.
        return p;
      });
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }

  /*
   * Click-to-open is for MODULE widgets only.
   *
   * A service tile already renders its own anchor covering the whole tile, so a second click
   * target here would be redundant — and `router.push` to an external URL is the wrong
   * navigation entirely. Leaving the tile's own link to do its job is both simpler and correct.
   */
  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (editing || external || !href) return;
    if ((e.target as HTMLElement).closest("a,button,input,select,textarea,label,[role='button']")) return;
    router.push(href);
  }

  const clickable = !editing && !external && !!href;

  return (
    <div
      className={`group relative flex flex-col rounded-xl transition ${editing ? "" : "lift"}`}
      style={{
        gridColumn: `span ${w}`,
        gridRow: `span ${h}`,
        opacity: dragging ? 0.4 : 1,
        outline: dropTarget
          ? "2px dashed var(--primary)"
          : editing
            ? "1px dashed var(--border-strong)"
            : undefined,
        outlineOffset: dropTarget || editing ? "4px" : undefined,
        cursor: clickable ? "pointer" : undefined,
      }}
      onClick={handleClick}
      // Reorder-by-drag stays, but only while arranging, and never during a corner resize —
      // the two gestures start the same way and would otherwise race.
      draggable={editing && !resizing}
      onDragStart={onDragStartItem}
      onDragEnter={onDragEnterItem}
      onDragOver={(e) => e.preventDefault()} // required for a drop to be allowed
      onDrop={(e) => {
        e.preventDefault();
        onDropItem();
      }}
      onDragEnd={onDragEndItem}
    >
      {/*
        The real, focusable way in for a module widget. The container's onClick is a pointer
        convenience and is invisible to a keyboard or a screen reader, so navigation must not
        depend on it — and wrapping the whole thing in an <a> isn't available, because a module
        may render its own links and buttons inside. A service tile needs none of this: its own
        anchor is already the focusable target.
      */}
      {clickable && (
        <a href={href!} className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-20">
          Open {name}
        </a>
      )}

      {/*
        `overflow-auto` + `min-h-0` is what makes the fixed row track safe: an item conforms to
        the box the dashboard gives it, but scrolls rather than clipping, because silently
        hiding a module's content is worse than showing it doesn't fit. `min-h-0` is required —
        a flex child won't shrink below its content without it and the scroller never engages.
        `min-h-full` rather than `h-full` so a SHORT item stretches to fill while a TALL one
        keeps its natural height inside the scroller.
      */}
      <div className="min-h-0 flex-1 overflow-auto [&>*]:min-h-full">{children}</div>

      {editing && (
        <>
          <div
            className="absolute left-1 top-1 z-10 flex items-center gap-1 rounded-lg border p-1 text-xs"
            style={{ background: "var(--background)", borderColor: "var(--border)" }}
          >
            <button
              type="button"
              disabled={isFirst}
              onClick={() => onNudge("up")}
              className="rounded px-2 py-1"
              style={{ border: "1px solid var(--border-strong)", opacity: isFirst ? 0.4 : 1 }}
              aria-label={`Move ${name} earlier`}
            >
              ←
            </button>
            <button
              type="button"
              disabled={isLast}
              onClick={() => onNudge("down")}
              className="rounded px-2 py-1"
              style={{ border: "1px solid var(--border-strong)", opacity: isLast ? 0.4 : 1 }}
              aria-label={`Move ${name} later`}
            >
              →
            </button>
            <span className="px-1 font-mono" style={{ color: "var(--muted)" }} aria-hidden>
              {w}×{h}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setPreview(null);
                run(() => resetItemAction(kind, refId, writeProfile()));
              }}
              className="rounded px-2 py-1"
              style={{ color: "var(--muted)" }}
              aria-label={`Reset ${name} to its default size`}
            >
              Reset
            </button>
          </div>

          {/*
            Bottom-right, where a resize handle is expected — and arrow-key operable, because a
            drag is worth nothing to anyone not using a pointer, which on a phone is everyone.
          */}
          <button
            type="button"
            onPointerDown={startResize}
            onKeyDown={(e) => {
              const metrics = cellMetrics();
              const columns = metrics?.columns ?? 6;
              const dw = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              const dh = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
              if (!dw && !dh) return;
              e.preventDefault();
              const nw = clampW(w + dw, columns);
              const nh = clampH(h + dh);
              if (nw === w && nh === h) return;
              setPreview({ w: nw, h: nh });
              run(() => setItemSizeAction(kind, refId, writeProfile(), nw, nh));
            }}
            className="absolute bottom-1 right-1 z-10 h-6 w-6 cursor-nwse-resize rounded"
            style={{ background: "var(--surface-2)", color: "var(--muted)", touchAction: "none" }}
            aria-label={`Resize ${name}. Currently ${w} wide by ${h} tall. Drag, or use the arrow keys.`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="m-auto">
              <circle cx="17" cy="17" r="1.8" />
              <circle cx="17" cy="11" r="1.8" />
              <circle cx="11" cy="17" r="1.8" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
