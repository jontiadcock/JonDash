"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setWidgetSizeAction, resetWidgetAction } from "./layout-actions";
import type { CellMetrics } from "./widget-grid";

const MIN_SPAN = 1;
const MAX_SPAN = 3;
const clamp = (n: number) => Math.min(MAX_SPAN, Math.max(MIN_SPAN, n));

/**
 * Wraps a module's dashboard widget.
 *
 * **Normally there is no chrome at all (CORE-08).** The widget is a thing you click to open,
 * and nothing of ours is painted over the module's own UI. The previous design revealed a
 * grip and a pencil on hover at `right-2 top-2` — exactly where a module puts its own "Open"
 * affordance, so ours won the click (BUG-53). Hover-revealed controls are also unreachable on
 * a touch screen, which can't hover.
 *
 * **Arranging is an explicit mode.** In it the controls are always visible: move buttons that
 * work by tap and keyboard, and a corner handle to drag-resize. Rare deliberate act, its own
 * mode — rather than chrome that has to hide from the other 99% of the time.
 *
 * The grid span is applied as an inline style, not a Tailwind class: class names built at
 * runtime aren't seen by the JIT compiler and would silently do nothing.
 */
export function WidgetFrame({
  moduleId,
  name,
  href,
  width,
  height,
  editing,
  isFirst,
  isLast,
  dragging,
  dropTarget,
  cellMetrics,
  onDragStartWidget,
  onDragEnterWidget,
  onDragEndWidget,
  onDropWidget,
  onNudge,
  children,
}: {
  moduleId: string;
  name: string;
  href: string | null;
  width: number;
  height: number;
  editing: boolean;
  isFirst: boolean;
  isLast: boolean;
  dragging: boolean;
  dropTarget: boolean;
  cellMetrics: () => CellMetrics | null;
  onDragStartWidget: () => void;
  onDragEnterWidget: () => void;
  onDragEndWidget: () => void;
  onDropWidget: () => void;
  onNudge: (direction: "up" | "down") => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // While a corner drag is in flight the frame previews the size it would become, so the
  // grid reflows under the pointer instead of jumping only once you let go.
  const [preview, setPreview] = useState<{ w: number; h: number } | null>(null);
  // State, not a ref: it decides whether the frame is `draggable`, so it has to cause a
  // re-render when it changes. A ref would leave HTML5 drag armed during a corner resize.
  const [resizing, setResizing] = useState(false);

  const w = preview?.w ?? width;
  const h = preview?.h ?? height;

  const run = (fn: () => Promise<void>) => startTransition(() => void fn());

  /**
   * Turn a corner drag into span units.
   *
   * Pointer events rather than HTML5 drag: this needs a live position on every move, and a
   * drag image would be nonsense for a resize. `setPointerCapture` keeps the moves coming
   * even when the pointer leaves the handle, which it immediately does.
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
      const nextW = clamp(startW + Math.round((ev.clientX - startX) / metrics.colWidth));
      const nextH = clamp(startH + Math.round((ev.clientY - startY) / metrics.rowHeight));
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
          run(() => setWidgetSizeAction(moduleId, p.w, p.h));
        }
        // Keep the preview until the server render lands, or the tile snaps back to its old
        // size for a frame and reads as the save having failed.
        return p;
      });
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }

  /**
   * Click anywhere on the widget to open it — except on something of the module's own that
   * is already interactive, which keeps working as its author intended.
   */
  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (editing || !href) return;
    if ((e.target as HTMLElement).closest("a,button,input,select,textarea,label,[role='button']")) return;
    router.push(href);
  }

  return (
    <div
      className={`group relative flex flex-col rounded-xl transition ${editing ? "" : "lift"}`}
      style={{
        gridColumn: `span ${w}`,
        gridRow: `span ${h}`,
        opacity: dragging ? 0.4 : 1,
        outline: dropTarget ? "2px dashed var(--primary)" : editing ? "1px dashed var(--border-strong)" : undefined,
        outlineOffset: dropTarget || editing ? "4px" : undefined,
        cursor: !editing && href ? "pointer" : undefined,
      }}
      onClick={handleClick}
      // Reorder-by-drag stays, but only while arranging, and never while a corner resize is
      // in flight — the two gestures start the same way and would otherwise race.
      draggable={editing && !resizing}
      onDragStart={onDragStartWidget}
      onDragEnter={onDragEnterWidget}
      onDragOver={(e) => e.preventDefault()} // required for a drop to be allowed
      onDrop={(e) => {
        e.preventDefault();
        onDropWidget();
      }}
      onDragEnd={onDragEndWidget}
    >
      {/*
        The real, focusable way in. The container's onClick is a pointer convenience and is
        invisible to a keyboard or a screen reader, so navigation must not depend on it — and
        wrapping the whole widget in an <a> is not available, because a module may render its
        own links and buttons inside.
      */}
      {href && !editing && (
        <a href={href} className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-20">
          Open {name}
        </a>
      )}

      {/*
        Three things at once, and the combination is the point.

        `[&>*]:min-h-full` is the second half of BUG-55: the row track gives the frame a real
        height, but a module's own root doesn't necessarily fill it, so a short widget left its
        cell part-empty. `min-h-full` rather than `h-full` so a SHORT widget stretches while a
        TALL one is still allowed to be its natural height inside the scroller.

        `overflow-auto` + `min-h-0` is what makes the fixed row track (BUG-59) safe. The owner's
        rule is that modules conform to the dashboard's box and content spilling out is bad module
        design — but the frame scrolls rather than clipping, because silently hiding a module's
        content is worse than showing it can't fit: the author sees the overflow, and nothing
        becomes unreachable for the user. `min-h-0` is required — a flex child will not shrink
        below its content without it, and the scroller would never engage.
      */}
      <div className="min-h-0 flex-1 overflow-auto [&>*]:min-h-full">{children}</div>

      {editing && (
        <>
          <div
            className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-lg border p-1 text-xs"
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
                run(() => resetWidgetAction(moduleId));
              }}
              className="rounded px-2 py-1"
              style={{ color: "var(--muted)" }}
              aria-label={`Reset ${name} to its default size`}
            >
              Reset
            </button>
          </div>

          {/*
            Bottom-right, where a resize handle is expected. Also keyboard-operable: arrow keys
            step the span, because a drag is worth nothing to anyone not using a pointer.
          */}
          <button
            type="button"
            onPointerDown={startResize}
            onKeyDown={(e) => {
              const dw = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              const dh = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
              if (!dw && !dh) return;
              e.preventDefault();
              const nw = clamp(w + dw);
              const nh = clamp(h + dh);
              if (nw === w && nh === h) return;
              setPreview({ w: nw, h: nh });
              run(() => setWidgetSizeAction(moduleId, nw, nh));
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
