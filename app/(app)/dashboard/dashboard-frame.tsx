"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setItemSizeAction } from "./layout-actions";
import type { CellMetrics } from "./dashboard-grid";
// `geometry`, not `layout` — the latter is server-only (Prisma), and this is a client component.
import { MIN_SPAN, MAX_HEIGHT, type DashboardKind, type DashboardProfile } from "@/lib/dashboard/geometry";

/*
 * ⚠ Both clamps come from the shared geometry — never re-declare them here. A local `MAX_HEIGHT`
 * once stopped the handle four rows short of what the server would happily store, with no
 * explanation on screen. REFS lib/dashboard/geometry.ts › MIN_SPAN · MAX_HEIGHT
 */
const clampW = (n: number, columns: number) => Math.min(columns, Math.max(MIN_SPAN, n));
const clampH = (n: number) => Math.min(MAX_HEIGHT, Math.max(MIN_SPAN, n));

/**
 * Wraps one dashboard item — a service tile or a module widget (CORE-11).
 *
 * ⚠ No chrome outside edit mode. Controls revealed on hover sat exactly where a module puts its
 * own "Open" (BUG-53), and hover cannot happen on a touch screen at all.
 * ⚠ The grid span is an inline style, not a Tailwind class — a class name built at runtime is
 * invisible to the compiler and silently produces no CSS.
 *
 * REFS app/(app)/dashboard/dashboard-grid.tsx — the only caller; owns the drag and the metrics
 *      app/(app)/dashboard/layout-actions.ts › setItemSizeAction() — where a resize is saved
 */
export function DashboardFrame({
  kind,
  refId,
  name,
  href,
  external,
  writeProfile,
  col,
  row,
  width,
  height,
  editing,
  dragging,
  dragDelta,
  registerEl,
  cellMetrics,
  onGrab,
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
  /** Explicit grid cell, 0-based (free placement). Every item has one — see dashboard-grid.tsx. */
  col: number;
  row: number;
  width: number;
  height: number;
  editing: boolean;
  dragging: boolean;
  /** How far this item has been dragged from where it started, or null when it isn't. */
  dragDelta: { x: number; y: number } | null;
  /** Hands the live element to the grid, for pointer hit-testing and the FLIP animation. */
  registerEl: (key: string, el: HTMLElement | null) => void;
  cellMetrics: () => CellMetrics | null;
  /** Named `onGrab`, not `onDragStart` — that is a real DOM handler, and this is not it. */
  onGrab: (e: React.PointerEvent) => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  // No pending flag: a resize shows its own result through `preview`, so it needs no busy state.
  const [, startTransition] = useTransition();
  // The size a corner drag would produce, so the grid reflows under the pointer rather than
  // jumping once you let go. Held past the save — see `finish` below.
  const [preview, setPreview] = useState<{ w: number; h: number } | null>(null);
  // ⚠ Suppresses move-drag while a corner resize is in flight: both gestures start with a
  // pointerdown on this element and would otherwise race for the pointer.
  const [resizing, setResizing] = useState(false);

  const w = preview?.w ?? width;
  const h = preview?.h ?? height;

  const run = (fn: () => Promise<void>) => startTransition(() => void fn());

  /**
   * Turn a corner drag into span units. ⚠ Pointer events, not HTML5 drag — this needs a live
   * position on every move, and `setPointerCapture` is what keeps them coming once the pointer
   * leaves the handle. REFS dashboard-grid.tsx › CellMetrics — the px-per-cell this converts with
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
        // ⚠ Hold the preview until the server render lands, or the item snaps back for a frame
        // and reads as the save having failed.
        return p;
      });
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }

  /*
   * Click-to-open is for MODULE widgets only — a service tile renders its own anchor over the whole
   * tile, and `router.push` to an external URL is the wrong navigation entirely.
   * REFS app/components/service-tile.tsx — the anchor this defers to
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
       * ⚠ The frame is the ONLY thing that lifts on hover, for both kinds. A tile lifting here AND
       * internally lifted twice, and the inner one moved it inside a container that clips — which
       * sliced the top off its card. REFS app/components/service-tile.tsx — deliberately has no
       * lift
       */
      ref={(el) => registerEl(`${kind}:${refId}`, el)}
      className={`group relative flex flex-col rounded-xl transition ${dragging ? "" : "lift"}`}
      style={{
        // ⚠ CSS grid lines are 1-based and the stored cell is 0-based — the +1 is the whole
        // difference. REFS lib/dashboard/geometry.ts › Placement — the 0-based source
        gridColumn: `${col + 1} / span ${w}`,
        gridRow: `${row + 1} / span ${h}`,
        outline: editing ? "1px dashed var(--border-strong)" : undefined,
        outlineOffset: editing ? "4px" : undefined,
        cursor: clickable ? "pointer" : editing ? "grab" : undefined,
        // ⚠ Without this a touch drag scrolls the page instead of moving the item — the browser
        // claims the gesture for panning first. Only while arranging, so scrolling is untouched.
        touchAction: editing ? "none" : undefined,
        // The dragged item follows the pointer above everything else. ⚠ `transition: none` while
        // dragging, or it lags the cursor by the FLIP duration set in dashboard-grid.tsx.
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
       * Drag starts from anywhere on the item while arranging, not from a grip.
       *
       * ⚠ Exclude by MARKER, never by tag name. Bailing on `closest("button,a,input,…")` meant no
       * service tile could be dragged at all, because a service tile *is* an `<a>` filling the
       * frame — while modules, having no anchor, dragged fine. `data-arrange-control` names only
       * the two things that must not start a move: the size readout and the resize handle, both
       * marked further down this file.
       */
      onPointerDown={(e) => {
        if (!editing || resizing || e.button !== 0) return;
        if ((e.target as HTMLElement).closest("[data-arrange-control]")) return;
        e.preventDefault();
        onGrab(e);
      }}
      /*
       * ⚠ `preventDefault` on pointerdown does NOT stop the click that follows. Without this a
       * service tile's anchor still navigates, so a drag that started on one opens the service in
       * a new tab instead of rearranging it.
       */
      onClickCapture={(e) => {
        if (!editing) return;
        if ((e.target as HTMLElement).closest("[data-arrange-control]")) return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* The real, focusable way in for a module widget — the container's onClick is invisible to
          a keyboard and a screen reader, and the whole frame cannot be an anchor because a module
          renders its own links inside. A service tile already has one, so it is excluded. */}
      {clickable && (
        <a href={href!} className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-20">
          Open {name}
        </a>
      )}

      {/*
        ⚠ Clip, never scroll (owner's call): a scrollbar inside every tile is noise to rescue the
        rare one that overflows, and it lets a badly sized widget look acceptable instead of
        obviously wrong. REFS docs/MODULES-AUTHORING.md — the contract saying a widget must adapt
        to the size the user gives it.
        ⚠ `min-h-0` is load-bearing: without it a flex child will not shrink below its content and
        the clip never engages. `[&>*]:h-full` gives the widget a known height to lay out against.
      */}
      {/* `@container` sizes content against THIS FRAME, not the window — a viewport breakpoint
          says nothing about a tile that may be one cell wide on a large screen. */}
      <div className="@container min-h-0 flex-1 overflow-hidden [&>*]:h-full">{children}</div>

      {editing && (
        <>
          {/*
            The size readout, and nothing else — the four nudge arrows went when free placement
            made them a dozen clicks to do what one drag does.
            ⚠ Known cost: they were the only way to MOVE an item without a pointer, so moving is
            now drag-only. Resizing keeps its keyboard path via the handle below.
            `data-arrange-control` marks it so grabbing the readout does not start a drag.
          */}
          <div
            data-arrange-control
            className="absolute left-1 top-1 z-10 rounded-lg border px-2 py-1 font-mono text-xs"
            style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--muted)" }}
            aria-hidden
          >
            {w}×{h}
          </div>

          {/* Bottom-right, where a resize handle is expected, and arrow-key operable — a drag is
              worth nothing to anyone not using a pointer. Marked so it cannot start a move. */}
          <button
            type="button"
            data-arrange-control
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
