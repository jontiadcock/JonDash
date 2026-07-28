import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Rendering-cost regressions (1.8.0-beta.1).
 *
 * **Source-level on purpose.** Every defect here is "a declaration is missing or has the wrong
 * value", which no behavioural test can see: the app renders correctly in all of them, it just
 * renders expensively, or a saved setting moves nothing. The same reasoning as the BUG-37
 * regression test — when the failure is an omission, assert against the source.
 *
 * These were found by measuring a seeded dashboard rather than by reading the CSS, and each
 * assertion below fails against the code as it stood before this beta.
 */
const read = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), "utf8");

const GLOBALS = read("app", "globals.css");
const STYLES = read("app", "styles.css");

/**
 * Comments stripped before matching. These files EXPLAIN the rules they follow — "`overflow-hidden`,
 * NOT `overflow-auto`" — so a `not.toMatch` over the raw source matches the very sentence saying the
 * bad thing isn't there. That is BUG-39's trap, and it has now caught me three times in this file
 * alone, which is exactly why the stripping lives at the top rather than in each assertion.
 */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const GRID = stripComments(read("app", "(app)", "dashboard", "dashboard-grid.tsx"));
const FRAME = stripComments(read("app", "(app)", "dashboard", "dashboard-frame.tsx"));

/** Crude but sufficient: split on `}` so each chunk holds one rule's declarations. */
function blocks(css: string): string[] {
  return css.split("}");
}

describe("backdrop-filter never costs anything for an opaque style", () => {
  /**
   * `blur(0px)` is NOT `none`. It still creates a stacking context, still promotes the element
   * to its own compositor layer, and still makes the compositor read back and re-filter the
   * backdrop every frame — for no visible difference. Measured before the fix: 37 promoted
   * layers covering 97% of the viewport on a 36-tile dashboard, in a style whose blur is 0.
   */
  it("does not build the filter out of --surface-blur", () => {
    for (const [name, css] of [["globals.css", GLOBALS], ["styles.css", STYLES]] as const) {
      expect(css, `${name} still derives backdrop-filter from --surface-blur`).not.toMatch(
        /backdrop-filter:\s*blur\(\s*var\(--surface-blur\)\s*\)/,
      );
    }
  });

  it("pairs every --surface-blur with a --surface-backdrop in the same rule", () => {
    for (const [name, css] of [["globals.css", GLOBALS], ["styles.css", STYLES]] as const) {
      for (const block of blocks(css)) {
        if (!block.includes("--surface-blur:")) continue;
        expect(block, `${name}: a rule sets --surface-blur without --surface-backdrop`).toMatch(
          /--surface-backdrop:/,
        );
      }
    }
  });

  it("resolves an opaque style's backdrop to none, never to a zero blur", () => {
    for (const [name, css] of [["globals.css", GLOBALS], ["styles.css", STYLES]] as const) {
      for (const block of blocks(css)) {
        if (!/--surface-blur:\s*0px/.test(block)) continue;
        expect(block, `${name}: a 0px blur must map to --surface-backdrop: none`).toMatch(
          /--surface-backdrop:\s*none/,
        );
      }
    }
  });

  it("still lets a translucent style opt in", () => {
    // The point is not to remove the effect — Crystal should still be glass.
    expect(STYLES).toMatch(/--surface-backdrop:\s*blur\(\d+px\)/);
  });
});

describe("the page wrapper does not keep a transform forever", () => {
  /**
   * `animation-fill-mode: both` retains the final keyframe, so a 220ms entrance left a
   * `transform` on a full-page element permanently — promoting the whole page to a compositor
   * layer and making it the containing block for every descendant `position: fixed`. That is
   * the root cause of BUG-23, which was fixed by portalling the overlays and leaving the
   * transform in place.
   */
  it("uses backwards fill on .page-fade, not both", () => {
    const rule = GLOBALS.match(/\.page-fade\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rule, ".page-fade rule not found").toContain("animation:");

    // Assert on the DECLARATION, not the rule text. The rule carries a comment explaining
    // why `both` is wrong, and a regex over source is a regex over comments too — the exact
    // trap that produced BUG-39, hit again here while writing this test.
    const declaration = rule.match(/animation:[^;]*;/)?.[0] ?? "";
    expect(declaration, "no animation declaration found").toContain("page-fade-in");
    expect(declaration, ".page-fade must not retain its final keyframe").not.toMatch(/\bboth\b/);
    expect(declaration).toMatch(/\bbackwards\b/);
  });
});

describe("hover lift is pointer-only", () => {
  /**
   * On a touch screen `:hover` latches after a tap, so a tapped tile stayed visibly raised
   * with nothing to un-raise it (CORE-08 asks for a pointer-only highlight).
   */
  it("guards .lift:hover behind a hovering-pointer query", () => {
    const idx = GLOBALS.indexOf(".lift:hover");
    expect(idx, ".lift:hover not found").toBeGreaterThan(-1);
    const preceding = GLOBALS.slice(0, idx);
    const lastMedia = preceding.lastIndexOf("@media");
    expect(lastMedia, ".lift:hover is not inside any media query").toBeGreaterThan(-1);
    expect(preceding.slice(lastMedia)).toMatch(/hover:\s*hover/);
  });
});

describe("the widget grid gives a row span something to multiply", () => {
  /**
   * BUG-54: with no row track, implicit rows are content-sized, so `grid-row: span 2` spans
   * two rows that have no independent height — the Height setting saved, re-rendered, and
   * moved nothing.
   */
  it("declares a row track", () => {
    expect(GRID, "grid has no gridAutoRows").toMatch(/gridAutoRows/);
  });

  /**
   * BUG-59: the track must be FIXED. A growable track (`minmax(x, auto)`) sizes itself to its
   * content, and a widget spanning several rows spreads its content across all of them — so one
   * widget resizing silently re-sized the tracks it shared with a neighbour, and an unrelated
   * widget changed height. Content-sized tracks cannot also be independent of content.
   */
  it("uses a fixed row height, so one widget cannot resize another", () => {
    expect(GRID, "a growable row track lets widgets push each other around (BUG-59)").not.toMatch(
      /auto-rows-\[minmax\(|gridAutoRows:\s*["'`]?minmax/,
    );
    expect(GRID, "the row height must be a concrete pixel value").toMatch(/gridAutoRows: `\$\{.*\}px`/);
  });

  /**
   * Owner, 2026-07-27: a cell must be SQUARE, so N×N is genuinely a square and sizes compose
   * predictably. The columns are fluid, so a constant row height is landscape at one window
   * width and portrait at another — it has to be the *measured* column width.
   */
  it("derives the row height from the measured column width", () => {
    expect(GRID, "row height is not measured — a constant can never be square").toMatch(
      /ResizeObserver/,
    );
    expect(GRID).toMatch(/setRowPx/);
  });

  it("clips an oversized widget rather than scrolling it", () => {
    // Owner's call: "if something can't be presented, it should be cut off and the module needs
    // to manage the sizings correctly." A scrollbar inside a tile is noise on every item to
    // rescue the rare one that overflows, and it lets a badly sized widget look acceptable.
    expect(FRAME, "a scroller is back inside the frame").not.toMatch(/overflow-auto/);
    expect(FRAME).toMatch(/overflow-hidden/);
    expect(FRAME, "without min-h-0 the flex child never shrinks and the clip is inert").toMatch(
      /min-h-0/,
    );
  });

  it("still applies the span the setting produces", () => {
    expect(FRAME).toMatch(/gridRow:\s*`span \$\{h\}`/);
    expect(FRAME).toMatch(/gridColumn:\s*`span \$\{w\}`/);
  });

  /**
   * BUG-55: a short widget left its cell part-empty because the module's root didn't fill it.
   * `min-h-full` rather than `h-full` — a short widget must stretch, while a tall one is still
   * allowed its natural height inside the scroller rather than being pinned to the frame.
   */
  it("pins the module's own root to the frame", () => {
    // `h-full` rather than `min-h-full` now that the frame clips: a widget should lay itself out
    // against a known height, not overflow one it cannot see.
    expect(FRAME, "widget frame does not size its child").toMatch(/\[&>\*\]:h-full/);
  });
});

describe("dragging is pointer-driven, not native HTML5 drag", () => {
  /**
   * Owner, 2026-07-27: *"when I drag and drop tiles, it just comes up with a box. I want icons
   * to dynamically move around when dragged so it doesn't feel clunky."*
   *
   * The box is the native drag image. It cannot be styled or replaced with anything useful,
   * the API ignores touch entirely, and it reports only coarse enter/leave — so there is
   * nothing precise enough to reflow against until the pointer is released. Every one of those
   * is a property of the API rather than of how it was used, so the fix is to not use it.
   */
  it("uses no HTML5 drag attributes or handlers", () => {
    for (const [name, src] of [["grid", GRID], ["frame", FRAME]] as const) {
      expect(src, `${name}: draggable is back — the browser will paint its own drag image`).not.toMatch(
        /\bdraggable\b/,
      );
      expect(src, `${name}: an HTML5 drag handler is back`).not.toMatch(
        /onDragStart=|onDragEnter=|onDragOver=|onDrop=|onDragEnd=/,
      );
    }
  });

  it("drives the drag from pointer events", () => {
    // The frame's own prop is `onGrab`, deliberately not `onDragStart` — that name is a real DOM
    // handler, so a component prop sharing it turns into one the moment props are spread onto an
    // element. This assertion tripped over exactly that confusion while being written.
    expect(FRAME, "the frame does not start a drag from a pointerdown").toMatch(/onPointerDown=/);
    expect(GRID, "the grid does not track the pointer during a drag").toMatch(
      /addEventListener\("pointermove"/,
    );
    expect(GRID, "a drag that never ends on pointerup would latch").toMatch(
      /addEventListener\("pointerup"/,
    );
    // Without this a touch drag is stolen by the browser for panning before we see a move.
    expect(FRAME, "touch-action is not released while arranging").toMatch(/touchAction/);
  });

  /**
   * CSS grid does not animate reflow: a reordered item simply appears in its new cell. FLIP —
   * measure, invert with a transform, release — is what turns that jump into movement, and it
   * animates only what actually moved rather than faking the layout.
   */
  it("animates the reflow with FLIP", () => {
    expect(GRID, "no before-rects are kept, so nothing can be inverted").toMatch(/getBoundingClientRect/);
    expect(GRID, "FLIP has to run before paint, so it belongs in a layout effect").toMatch(
      /useLayoutEffect/,
    );
    expect(GRID, "an animation with no reduced-motion escape").toMatch(/prefers-reduced-motion/);
  });

  /**
   * Owner, 2026-07-28: *"other ones will vanish off screen as if the one I'm moving has forced
   * them off, if I'm moving a big tile."*
   *
   * Two causes, both about size. A module widget is four times a tile's area, so merely brushing
   * its edge was enough to reorder — and because a wide item that no longer fits its row pushes
   * everything after it down, one accidental swap moved small tiles most of a screen. FLIP then
   * inverted that: the tile was placed at its old position, frequently outside the viewport, and
   * animated back in, which reads as vanishing rather than as moving.
   */
  it("reorders only once the pointer is past the target's centre", () => {
    expect(GRID, "any contact with a target still triggers a reorder").toMatch(/pastCentre/);
    expect(GRID, "the centre test must pick an axis rather than assume one").toMatch(/sameRow/);
  });

  it("does not animate a tile across more than a screen", () => {
    expect(GRID, "a FLIP longer than the viewport reads as vanishing, not moving").toMatch(
      /window\.innerWidth|window\.innerHeight/,
    );
  });

  it("saves once, when the drag ends", () => {
    // Dragging across six items would otherwise fire six writes, and the arrangements passed
    // through on the way were never something the user asked for.
    // `reorderItemsAction(` — the call, not the import line above it.
    const moves = GRID.match(/reorderItemsAction\(/g) ?? [];
    expect(moves.length, "reorderItemsAction is called from more than one place").toBe(1);
  });
});

describe("widget chrome does not sit on the module's own controls", () => {
  /**
   * BUG-53: the control cluster was `absolute right-2 top-2`, exactly where a module puts its
   * own "Open" affordance, and won the click. CORE-08 moves everything behind an explicit
   * edit mode, so in normal use there is no chrome to collide with.
   */
  it("renders move and resize controls only while editing", () => {
    expect(FRAME).toMatch(/\{editing && \(/);
  });

  it("keeps no hover-revealed control cluster", () => {
    expect(FRAME, "hover-revealed chrome is back").not.toMatch(/group-hover:opacity-100/);
    expect(FRAME, "the top-right control cluster is back").not.toMatch(/absolute right-2 top-2/);
  });

  it("gives keyboard users a real link, not just a container click", () => {
    expect(FRAME).toMatch(/sr-only focus:not-sr-only/);
  });
});
