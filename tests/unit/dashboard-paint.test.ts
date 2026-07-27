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
const GRID = read("app", "(app)", "dashboard", "dashboard-grid.tsx");
const FRAME = read("app", "(app)", "dashboard", "dashboard-frame.tsx");

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
  it("declares an auto-rows track", () => {
    expect(GRID, "widget grid has no grid-auto-rows track").toMatch(/auto-rows-\[/);
  });

  /**
   * BUG-59: the track must be FIXED. A growable track (`minmax(x, auto)`) sizes itself to its
   * content, and a widget spanning several rows spreads its content across all of them — so one
   * widget resizing silently re-sized the tracks it shared with a neighbour, and an unrelated
   * widget changed height. Content-sized tracks cannot also be independent of content.
   */
  it("uses a fixed row height, so one widget cannot resize another", () => {
    expect(GRID, "a growable row track lets widgets push each other around (BUG-59)").not.toMatch(
      /auto-rows-\[minmax\(/,
    );
    expect(GRID).toMatch(/auto-rows-\[[\d.]+(px|rem)\]/);
  });

  it("lets a widget scroll rather than clipping it", () => {
    // The owner's rule is that a module conforms to the dashboard's box — but the frame scrolls
    // instead of clipping, because silently hiding content is worse than showing it doesn't fit.
    // `min-h-0` is load-bearing: a flex child won't shrink below its content without it, and the
    // scroller would never engage.
    expect(FRAME, "frame does not scroll its overflow").toMatch(/overflow-auto/);
    expect(FRAME, "without min-h-0 the flex child never shrinks and overflow-auto is inert").toMatch(
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
  it("stretches the module's own root to the frame", () => {
    expect(FRAME, "widget frame does not stretch its child").toMatch(/\[&>\*\]:min-h-full/);
    expect(FRAME, "h-full would pin a tall widget and defeat the scroller").not.toMatch(
      /\[&>\*\]:h-full/,
    );
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
