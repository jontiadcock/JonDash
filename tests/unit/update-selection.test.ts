import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The Available updates list: what is ticked must be what happens (1.8.0).
 *
 * **Source-level on purpose.** The defect was that an EMPTY selection silently meant
 * "everything" — so the page rendered N unticked boxes above a button that would update all N,
 * and the owner reasonably concluded JonDash and the add-ons could not be picked separately.
 * They always could; the UI simply never showed it. Nothing misbehaved, so no behavioural test
 * of the component would have caught it — the same reasoning as the BUG-37 regression test.
 */
const SRC = fs.readFileSync(
  path.join(process.cwd(), "app", "admin", "updates", "available-updates.tsx"),
  "utf8",
);

/** Strip comments — this file explains the old behaviour, and a regex over source is a regex
 *  over comments too (the trap that produced BUG-39, and that bit me writing these tests). */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("what is ticked is what happens", () => {
  it("has no empty-selection-means-everything fallback", () => {
    expect(CODE, "the 'nothing ticked = act on everything' fallback is back").not.toMatch(
      /chosen\.length\s*>\s*0\s*\?\s*chosen\s*:\s*selectable/,
    );
  });

  it("tracks exclusions, so a newly-found update arrives ticked", () => {
    // Storing inclusions would leave anything discovered by "Check now" silently excluded from
    // a button that claims to update the selection.
    expect(CODE).toMatch(/deselected/);
    expect(CODE).toMatch(/const isTicked/);
  });

  it("derives the button label from what will actually run", () => {
    expect(CODE).toMatch(/Update selected \(\$\{effective\.length\}\)/);
    expect(CODE, "'Update all' implied a hidden selection").not.toMatch(/"Update all"/);
  });

  it("disables the button when nothing is ticked", () => {
    expect(CODE).toMatch(/nothingChosen/);
    expect(CODE).toMatch(/disabled=\{nothingChosen\}/);
    expect(CODE).toMatch(/disabled=\{pending \|\| nothingChosen\}/);
  });

  it("keeps the control on screen when the last row is unticked", () => {
    // Rendering on `effective` made the whole control vanish, which reads as a broken page.
    expect(CODE).toMatch(/selectable\.length\s*>\s*0\s*\?/);
  });

  it("still refuses to tick something blocked or awaiting consent", () => {
    // `disabled` covers a blocked update and one that wants more access than was approved;
    // neither may appear ticked, or the count would promise something that cannot happen.
    expect(CODE).toMatch(/checked=\{!disabled && isTicked\(it\)\}/);
  });
});
