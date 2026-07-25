"use client";

import { useRef, useState, useTransition } from "react";
import { WidgetFrame } from "./widget-frame";
import { reorderWidgetsAction } from "./layout-actions";

export type WidgetItem = {
  id: string;
  name: string;
  width: number;
  height: number;
  node: React.ReactNode;
};

/**
 * The dashboard's module-widget grid, owning drag-and-drop reordering.
 *
 * Drag state has to live above the widgets — a drop needs to know both what is being
 * dragged and what it landed on — so this wraps them all. Each widget's rendered output is
 * passed in as `node`: it's a server component (it may query, and it must not become client
 * code), and handing it through as a prop keeps it that way.
 *
 * **Native HTML5 drag events, no library.** A drag-and-drop dependency would be a sizeable
 * addition for one screen, and the CSP forbids remote scripts anyway.
 *
 * Reordering is optimistic — the grid rearranges immediately and the save happens behind it
 * — because waiting for a round-trip before the tile moves feels broken. If the save fails,
 * the next server render puts things back.
 *
 * **Dragging is not the only way to reorder.** It's unavailable to keyboard users and
 * unreliable on touch, so the per-widget edit popover keeps explicit move buttons. That was
 * the original reason this screen had no drag-and-drop at all; the answer is to offer both,
 * not to drop the accessible path.
 */
export function WidgetGrid({ items }: { items: WidgetItem[] }) {
  const [order, setOrder] = useState<string[]>(() => items.map((i) => i.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // What's being dragged is held in a ref as well as state. The ref is the source of truth
  // for the drop, because `drop` can arrive in the same batch as `dragstart` — the state
  // captured in the handler's closure would still be null and the drop would be dropped.
  // The state exists only to drive the visual (the dragged tile dims).
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

  /** Move one place, for the popover's buttons and keyboard users. */
  function nudge(id: string, direction: "up" | "down") {
    const next = [...order];
    const from = next.indexOf(id);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from === -1 || to < 0 || to >= next.length) return;
    [next[from], next[to]] = [next[to], next[from]];
    commit(next);
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ordered.map((item, index) => (
        <WidgetFrame
          key={item.id}
          moduleId={item.id}
          name={item.name}
          width={item.width}
          height={item.height}
          isFirst={index === 0}
          isLast={index === ordered.length - 1}
          dragging={draggingId === item.id}
          dropTarget={overId === item.id && draggingId !== null && draggingId !== item.id}
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
  );
}
