import { describe, it, expect } from "vitest";
import {
  packLayout,
  overlaps,
  displaceFor,
  type DashboardKind,
  type Placement,
} from "@/lib/dashboard/geometry";

/**
 * Free placement (1.8.0) — the packing and collision maths.
 *
 * Owner: *"I want to be able to arrange the grid in any way I want… one icon at the top, and one
 * at the bottom, not directly next to each other."* A position stops being a consequence of order
 * and becomes data, which needs two things to be exactly right:
 *
 *  - a **stored** position is honoured to the cell, gaps included — anything that tidies up on
 *    read silently undoes what the user did;
 *  - anything **without** one still has to appear somewhere sensible, because most items have no
 *    stored position at all until somebody drags something.
 *
 * `packLayout` is pure and shared by the server render and the browser's drag, which is what lets
 * a drag test a candidate cell without measuring the DOM. If the two ever disagreed, a drop would
 * land somewhere other than where it was shown.
 * REFS lib/dashboard/geometry.ts
 */
const item = (
  id: string,
  width: number,
  height: number,
  col: number | null = null,
  row: number | null = null,
) => ({ kind: "module" as DashboardKind, id, width, height, col, row });

const at = (m: Map<string, Placement>, id: string): Placement => m.get(`module:${id}`)!;

describe("overlaps", () => {
  const box = { col: 2, row: 2, width: 2, height: 2 }; // covers cols 2-3, rows 2-3

  it("is true only when cells are genuinely shared", () => {
    expect(overlaps(box, { col: 3, row: 3, width: 2, height: 2 })).toBe(true);
    expect(overlaps(box, { col: 2, row: 2, width: 1, height: 1 })).toBe(true);
  });

  it("treats touching edges as free, not overlapping", () => {
    // The classic off-by-one: an item ending at column 3 and one starting at column 4 are
    // adjacent, not on top of each other. Getting this wrong makes half the grid undroppable.
    expect(overlaps(box, { col: 4, row: 2, width: 2, height: 2 })).toBe(false);
    expect(overlaps(box, { col: 2, row: 4, width: 2, height: 2 })).toBe(false);
    expect(overlaps(box, { col: 0, row: 2, width: 2, height: 2 })).toBe(false);
  });
});

/**
 * Dropping onto an occupied cell moves what is in the way (owner, 2026-07-28: *"when I drop a tile
 * on top of another tile, [make] the other tiles shuffle over"*), and they also asked whether the
 * board **stays organised and nice to look at** — so tidiness is asserted here rather than
 * eyeballed.
 *
 * "Organised" is given three concrete meanings, because a vague one cannot be tested:
 *   1. **Nothing overlaps.** Non-negotiable — an overlapped tile is unreachable.
 *   2. **Only what was in the way moves.** Free placement means gaps are deliberate; a shuffle
 *      that tidied the whole board would undo the very thing it exists to allow.
 *   3. **Displaced items move a short distance**, so the result still looks like the board you had.
 */
const box = (col: number, row: number, w = 3, h = 3): Placement => ({ col, row, width: w, height: h });
const layout = (entries: Record<string, Placement>) => new Map(Object.entries(entries));
const boxesOverlap = (m: Map<string, Placement>) => {
  const v = [...m.entries()];
  for (let i = 0; i < v.length; i++)
    for (let j = i + 1; j < v.length; j++)
      if (overlaps(v[i][1], v[j][1])) return `${v[i][0]} overlaps ${v[j][0]}`;
  return null;
};
const dist = (a: Placement, b: Placement) => Math.hypot(a.col - b.col, a.row - b.row);

describe("displaceFor — dropping onto an occupied cell", () => {
  it("never leaves two things on top of each other", () => {
    const before = layout({ a: box(0, 0), b: box(3, 0), c: box(6, 0), d: box(9, 0) });
    // Drop `a` squarely onto `c`.
    const after = displaceFor(new Map(before).set("a", box(6, 0)), "a", 18);
    expect(boxesOverlap(after)).toBeNull();
  });

  it("leaves the dropped tile exactly where it was dropped", () => {
    const before = layout({ a: box(0, 0), b: box(6, 0) });
    const after = displaceFor(new Map(before).set("a", box(6, 0)), "a", 18);
    // The board rearranges around the anchor; it never negotiates with it.
    expect(after.get("a")).toMatchObject({ col: 6, row: 0 });
  });

  it("moves ONLY what was in the way — every other gap survives", () => {
    // `far` sits alone with deliberate space around it: the arrangement free placement exists for.
    const before = layout({ a: box(0, 0), victim: box(6, 0), far: box(15, 12) });
    const after = displaceFor(new Map(before).set("a", box(6, 0)), "a", 18);
    expect(after.get("far"), "an untouched tile was tidied away").toMatchObject({ col: 15, row: 12 });
    expect(after.get("victim")).not.toMatchObject({ col: 6, row: 0 });
  });

  it("puts a displaced tile somewhere near where it was, not at the end of the grid", () => {
    const before = layout({ a: box(0, 0), victim: box(6, 0) });
    const after = displaceFor(new Map(before).set("a", box(6, 0)), "a", 18);
    // Three columns is one tile's width — it should step aside, not emigrate.
    expect(dist(after.get("victim")!, box(6, 0))).toBeLessThanOrEqual(4);
  });

  it("cascades when the displaced tile lands on someone else", () => {
    const before = layout({ a: box(0, 0), b: box(3, 0), c: box(6, 0), d: box(9, 0), e: box(12, 0) });
    const after = displaceFor(new Map(before).set("a", box(3, 0)), "a", 18);
    expect(boxesOverlap(after)).toBeNull();
    expect(after.size).toBe(5);
  });

  it("handles a big widget landing on several small tiles at once", () => {
    const before = layout({
      big: box(0, 9, 6, 6),
      t1: box(0, 0),
      t2: box(3, 0),
      t3: box(0, 3),
      t4: box(3, 3),
    });
    const after = displaceFor(new Map(before).set("big", box(0, 0, 6, 6)), "big", 18);
    expect(boxesOverlap(after)).toBeNull();
    expect(after.get("big")).toMatchObject({ col: 0, row: 0 });
    expect(after.size).toBe(5);
  });

  /** The property that makes hovering across a board feel stable rather than destructive. */
  it("is reversible — moving back restores the original board exactly", () => {
    const before = layout({ a: box(0, 0), b: box(3, 0), c: box(6, 0) });
    const shoved = displaceFor(new Map(before).set("a", box(6, 0)), "a", 18);
    expect(shoved.get("c")).not.toMatchObject({ col: 6, row: 0 });
    // Resolved against BASE each time, as the drag does — not against the shoved result.
    const back = displaceFor(new Map(before).set("a", box(0, 0)), "a", 18);
    expect([...back.entries()].sort()).toEqual([...before.entries()].sort());
  });

  it("changes nothing when the target is already empty", () => {
    const before = layout({ a: box(0, 0), b: box(3, 0) });
    const after = displaceFor(new Map(before).set("a", box(12, 6)), "a", 18);
    expect(after.get("b"), "an unrelated tile moved for a drop that collided with nothing")
      .toMatchObject({ col: 3, row: 0 });
  });

  /**
   * The stress case, and the one the owner's question is really about: shove a big widget through
   * a full board and check it still looks like a dashboard afterwards.
   */
  it("keeps a crowded board tidy after a shove", () => {
    const before = new Map<string, Placement>();
    for (let i = 0; i < 12; i++) before.set(`t${i}`, box((i % 6) * 3, Math.floor(i / 6) * 3));
    before.set("big", box(0, 12, 6, 6));

    const after = displaceFor(new Map(before).set("big", box(3, 0, 6, 6)), "big", 18);

    expect(boxesOverlap(after)).toBeNull();
    expect(after.size).toBe(13);
    // Nothing flung off the side, and nothing sent miles down the page.
    for (const [key, p] of after) {
      expect(p.col, `${key} is off the grid`).toBeGreaterThanOrEqual(0);
      expect(p.col + p.width, `${key} overflows the grid`).toBeLessThanOrEqual(18);
      expect(p.row, `${key} was sent far down the page`).toBeLessThan(24);
    }
    // Most of the board should be untouched — a shove is not a redraw.
    const moved = [...after].filter(([k, p]) => {
      const was = before.get(k)!;
      return was.col !== p.col || was.row !== p.row;
    });
    expect(moved.length, `${moved.length} of 13 tiles moved — a shove should disturb few`).toBeLessThanOrEqual(7);
  });
});

describe("packLayout", () => {
  it("honours a stored position exactly, gap and all", () => {
    const placed = packLayout([item("a", 3, 3, 0, 0), item("b", 3, 3, 15, 20)], 18);
    expect(at(placed, "a")).toMatchObject({ col: 0, row: 0 });
    expect(at(placed, "b")).toMatchObject({ col: 15, row: 20 });
  });

  it("packs an unpositioned item into the first free space", () => {
    const placed = packLayout([item("a", 3, 3), item("b", 3, 3), item("c", 3, 3)], 18);
    expect(at(placed, "a")).toMatchObject({ col: 0, row: 0 });
    expect(at(placed, "b")).toMatchObject({ col: 3, row: 0 });
    expect(at(placed, "c")).toMatchObject({ col: 6, row: 0 });
  });

  it("wraps to the next row when an item will not fit the remainder", () => {
    // 18 columns: two 8-wide items fit, the third cannot start at 16.
    const placed = packLayout([item("a", 8, 2), item("b", 8, 2), item("c", 8, 2)], 18);
    expect(at(placed, "a")).toMatchObject({ col: 0, row: 0 });
    expect(at(placed, "b")).toMatchObject({ col: 8, row: 0 });
    expect(at(placed, "c").row).toBeGreaterThan(0);
  });

  /** A stored position must never be displaced by something being packed around it. */
  it("packs around a stored position rather than through it", () => {
    const placed = packLayout([item("fixed", 3, 3, 0, 0), item("new", 3, 3)], 18);
    expect(at(placed, "fixed")).toMatchObject({ col: 0, row: 0 });
    expect(overlaps(at(placed, "new"), { col: 0, row: 0, width: 3, height: 3 })).toBe(false);
  });

  it("fills a gap left between two stored items", () => {
    // Something 3 wide belongs in the hole at column 3, not appended after everything.
    const placed = packLayout([item("l", 3, 3, 0, 0), item("r", 3, 3, 6, 0), item("new", 3, 3)], 18);
    expect(at(placed, "new")).toMatchObject({ col: 3, row: 0 });
  });

  it("never overlaps anything, whatever the mix", () => {
    const placed = packLayout(
      [
        item("wide", 12, 6, 0, 0),
        item("stored", 3, 3, 15, 1),
        item("p1", 6, 6),
        item("p2", 3, 3),
        item("p3", 9, 3),
        item("p4", 1, 1),
      ],
      18,
    );
    const boxes = [...placed.values()];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlaps(boxes[i], boxes[j]), `${i} overlaps ${j}`).toBe(false);
      }
    }
    expect(boxes).toHaveLength(6);
  });

  it("places everything, even when the grid is narrow", () => {
    const placed = packLayout([item("a", 3, 3), item("b", 3, 3), item("c", 6, 6), item("d", 3, 3)], 6);
    expect(placed.size).toBe(4);
    for (const p of placed.values()) expect(p.col + p.width).toBeLessThanOrEqual(6);
  });

  /**
   * A layout saved on a desktop and rendered on a phone: an item wider than the whole grid has
   * to be brought inside it, or it would be placed at a column that cannot exist.
   */
  it("shrinks an item too wide for the grid rather than overflowing", () => {
    const p = at(packLayout([item("big", 18, 6, 0, 0)], 6), "big");
    expect(p.col).toBe(0);
    expect(p.width).toBeLessThanOrEqual(6);
  });

  /** A stored position that no longer fits is re-packed rather than dropped or overflowed. */
  it("re-packs a stored position that has fallen outside the grid", () => {
    const p = at(packLayout([item("a", 3, 3, 15, 0)], 6), "a");
    expect(p.col + p.width).toBeLessThanOrEqual(6);
  });

  it("is deterministic — the same input gives the same layout", () => {
    const build = () => packLayout([item("a", 3, 3), item("b", 6, 6, 9, 0), item("c", 3, 3)], 18);
    expect([...build().entries()]).toEqual([...build().entries()]);
  });
});
