"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setItemSizeAction, resetItemAction } from "./layout-actions";
import type { CellMetrics } from "./dashboard-grid";
// `geometry`, not `layout` — the latter is server-only (Prisma), and this is a client component.
import { MIN_SPAN, MAX_HEIGHT, type DashboardKind, type DashboardProfile } from "@/lib/dashboard/geometry";

/*
 * Both clamps come from the shared geometry now. They used to be local constants with
 * `MAX_HEIGHT = 6`, which silently stopped an item four rows short of what the server would
 * happily store — the resize handle simply refused to go further with no explanation. Two
 * definitions of the same limit is one too many.
 */
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
  dragDelta,
  registerEl,
  cellMetrics,
  onGrab,
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
  /** How far this item has been dragged from where it started, or null when it isn't. */
  dragDelta: { x: number; y: number } | null;
  /** Hands the live element to the grid, for pointer hit-testing and the FLIP animation. */
  registerEl: (key: string, el: HTMLElement | null) => void;
  cellMetrics: () => CellMetrics | null;
  /** Named `onGrab`, not `onDragStart` — that is a real DOM handler, and this is not it. */
  onGrab: (e: React.PointerEvent) => void;
  onNudge: (direction: "up" | "down") => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // While a corner drag is in flight the frame previews the size it would become, so the grid
  // reflows under the pointer instead of jumping only once you let go.
  const [preview, setPreview] = useState<{ w: number; h: number } | null>(null);
  // Suppresses move-drag while a corner resize is in flight — the two gestures both start with
  // a pointerdown on this element and would otherwise race.
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
      /*
       * `lift` in BOTH modes (owner, 2026-07-27): service tiles rose on hover while arranging
       * and module widgets did not, because a tile carries its own `lift` internally while the
       * frame only applied one outside edit mode. The inconsistency read as modules being less
       * interactive than tiles in the very mode where you are handling both.
       */
      ref={(el) => registerEl(`${kind}:${refId}`, el)}
      className={`group relative flex flex-col rounded-xl transition ${dragging ? "" : "lift"}`}
      style={{
        gridColumn: `span ${w}`,
        gridRow: `span ${h}`,
        outline: editing ? "1px dashed var(--border-strong)" : undefined,
        outlineOffset: editing ? "4px" : undefined,
        cursor: clickable ? "pointer" : editing ? "grab" : undefined,
        // Without this a touch drag scrolls the page instead of moving the item — the browser
        // claims the gesture for panning before our handler ever sees a move. Only while
        // arranging, so ordinary scrolling over the dashboard is untouched.
        touchAction: editing ? "none" : undefined,
        // The dragged item follows the pointer and rides above everything else. `transition:
        // none` while dragging, or it would lag behind the cursor by the FLIP duration; the
        // shadow and slight scale are what make it read as picked up rather than just offset.
        ...(dragging && dragDelta
          ? {
              transform: `translate(${dragDelta.x}px, ${dragDelta.y}px) scale(1.03)`,
              transition: "none",
              zIndex: 30,
              boxShadow: "var(--shadow-hover)",
              pointerEvents: "none" as const,
            }
          : null),
      }}
      onClick={handleClick}
      /*
       * Drag starts from anywhere on the item while arranging — not from a grip.
       *
       * Excluded: the arrange controls and the resize handle. Those are `button`s inside the
       * frame, and without this check grabbing the corner to resize would also start a move, so
       * the two gestures would race and the item would jump away from the cursor.
       */
      onPointerDown={(e) => {
        if (!editing || resizing || e.button !== 0) return;
        if ((e.target as HTMLElement).closest("button,a,input,select,textarea")) return;
        e.preventDefault();
        onGrab(e);
      }}
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
        `overflow-hidden`, NOT `overflow-auto` — the owner's call, 2026-07-27.
        *"if something can't be presented, it should be cut off and the module needs to manage
        the sizings correctly."*
        I originally chose a scroller on the grounds that hiding content is worse than showing
        it doesn't fit. In a dashboard that's the wrong trade: a scrollbar inside a tile is
        noise on every single item to rescue the rare one that overflows, and it lets a badly
        sized widget look acceptable instead of obviously wrong. Clipping makes the author's
        problem visible, which is where it belongs — the contract in
        docs/MODULES-AUTHORING.md says a widget is resized by the user and must adapt.

        `min-h-0` is still required: without it a flex child refuses to shrink below its content
        and the clip never engages. `[&>*]:h-full` pins the child to the frame so a widget can
        lay itself out against a known height rather than overflowing one it can't see.
      */}
      <div className="min-h-0 flex-1 overflow-hidden [&>*]:h-full">{children}</div>

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
