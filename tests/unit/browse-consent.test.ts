import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * **A module cannot be installed without its permissions having been on screen** (design A1 → B1).
 *
 * This is the property the catalogue rework exists to establish, and it is a *structural* one: the
 * grid shows a one-word risk chip, and the full list of what a module can do lives on its own
 * page — so both install actions must live there too. The design this replaced put a checkbox on
 * every row of one long list, which let a module be selected and installed with its permissions
 * never having been rendered.
 *
 * **Source-level, and it has to be.** The defect would be an install control reappearing on the
 * catalogue — a page that renders perfectly well and simply asks for less consent than it should.
 * There is no behaviour to observe: both versions install the module. So the assertion is about
 * where the controls are allowed to exist.
 * REFS app/admin/modules/browse/browse-grid.tsx · app/admin/modules/browse/page.tsx
 *      app/admin/modules/browse/[id]/page.tsx · app/admin/modules/browse/[id]/module-actions.tsx
 *      app/admin/modules/browse/module-detail.tsx · app/admin/modules/browse/@modal — read as text
 */
const read = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), "utf8");
// A regex over source is a regex over comments too (BUG-39), and these files explain the rule
// they follow at length — naming the very things being asserted absent.
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const GRID = strip(read("app", "admin", "modules", "browse", "browse-grid.tsx"));
const CATALOGUE = strip(read("app", "admin", "modules", "browse", "page.tsx"));
const DETAIL = strip(read("app", "admin", "modules", "browse", "[id]", "page.tsx"));
const ACTIONS = strip(read("app", "admin", "modules", "browse", "[id]", "module-actions.tsx"));
/**
 * The consent screen itself, shared by the full page and the overlay that expands over the grid.
 */
const SHARED = strip(read("app", "admin", "modules", "browse", "module-detail.tsx"));
const OVERLAY = strip(read("app", "admin", "modules", "browse", "@modal", "(.)[id]", "page.tsx"));

describe("consent lives on the module's own page", () => {
  it("the catalogue grid has no way to install or queue", () => {
    expect(GRID, "an install action is back on a catalogue card").not.toMatch(
      /installModuleAction|toggleQueued|Install now|Queue install/,
    );
    // A checkbox on a row is the exact shape of the design this replaced.
    expect(GRID, "a per-row selection control is back").not.toMatch(/type="checkbox"/);
  });

  it("a card is a link to the module's page, not a control", () => {
    expect(GRID).toMatch(/\/admin\/modules\/browse\/\$\{encodeURIComponent\(m\.id\)\}/);
  });

  it("the detail spells the permissions out, rather than summarising them", () => {
    // `describePermission` is the single place consent wording is decided; a chip is derived from
    // the same data but is deliberately lossy, so the full sentences must appear here.
    expect(SHARED).toMatch(/describePermission\(/);
    expect(GRID, "the grid must not render consent sentences — it has no room for them").not.toMatch(
      /describePermission\(/,
    );
  });

  /**
   * One module, two routes: the overlay that expands over the catalogue and the page a pasted link
   * or a reload gives you. **Both must render the same component.** A second hand-written copy is
   * how one of them ends up listing fewer permissions than the other after an edit, and the one
   * that under-lists is the one people would actually be clicking Install on.
   */
  it("the overlay and the page share one consent screen", () => {
    expect(DETAIL, "the page stopped using the shared consent screen").toMatch(/<ModuleDetail/);
    expect(OVERLAY, "the overlay stopped using the shared consent screen").toMatch(/<ModuleDetail/);
    expect(OVERLAY, "the overlay grew its own copy of the permission list").not.toMatch(
      /describePermission\(/,
    );
    expect(DETAIL, "the page grew its own copy of the permission list").not.toMatch(
      /describePermission\(/,
    );
  });

  /**
   * An intercepted route is a real route. It renders on the server and is fetchable directly, so
   * "it only appears when you click a card" is a statement about the UI, not about who can reach
   * it — it needs the same capability check as the page it mirrors.
   */
  it("guards the overlay like any other admin entry point", () => {
    expect(OVERLAY).toMatch(/requirePermission\("modules\.manage"\)/);
    expect(DETAIL).toMatch(/requirePermission\("modules\.manage"\)/);
  });

  it("counts helper capabilities as part of what is being approved", () => {
    // A module earns the right to use a helper by DECLARING the helper, not by declaring a
    // permission — so a list built from the module's own declarations alone understates it.
    expect(SHARED).toMatch(/helperCapabilities/);
    expect(CATALOGUE, "the risk chip ignores what the helpers can do").toMatch(/helperCapabilities/);
  });

  it("keeps both install actions together on the detail page", () => {
    expect(ACTIONS).toMatch(/Queue install/);
    expect(ACTIONS).toMatch(/Install now/);
    expect(ACTIONS).toMatch(/installModuleAction/);
  });

  /** 8.4 — opening a module from page 4 and coming back must not land on page 1. */
  it("carries the catalogue page through to the module and back", () => {
    expect(GRID, "the link drops the page, so Back cannot restore it").toMatch(/page=\$\{current\}/);
    expect(DETAIL, "the back link does not restore the page you came from").toMatch(/backHref/);
    expect(DETAIL).toMatch(/page \? `&page=/);
  });
});
