import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Every savable setting says when it isn't saved yet (1.8.0-beta.11).
 *
 * Owner: *"seems that a lot of buttons are doing the same thing… correct all buttons (a note to
 * user saying (not saved yet) on all savable settings is important for consistency)"* — after
 * hitting the same revert twice, on two different screens.
 *
 * Two rules, and both are omissions no behavioural test would catch, because a form with a
 * stale control still renders, still submits, and still saves:
 *
 *  1. **Every settings form uses the shared `SaveBar`.** A form that hand-rolls its own button
 *     row is how the inconsistency happened the first time.
 *  2. **No settings form seeds a control with `defaultValue`/`defaultChecked`.** Those seed once,
 *     at mount, and then ignore the server forever — so after a save the screen can disagree
 *     with the database until someone reloads. The exception is a write-only secret, whose
 *     server value is deliberately never sent and which should clear once saved.
 * REFS app/components/save-bar.tsx — read as text
 */
const read = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), "utf8");

// A regex over source is a regex over comments too (BUG-39) — and these files explain the very
// rules being asserted, quoting `defaultValue` in prose while not using it.
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The settings screens: a form whose job is to change a stored setting. */
const FORMS: Record<string, string[]> = {
  "email settings": ["app", "admin", "email", "ui.tsx"],
  "general settings": ["app", "admin", "settings", "ui.tsx"],
  "appearance": ["app", "admin", "settings", "style-form.tsx"],
  "logo": ["app", "admin", "settings", "logo-form.tsx"],
  "network": ["app", "admin", "network", "ui.tsx"],
  "update schedule": ["app", "admin", "updates", "schedule-form.tsx"],
  "session length": ["app", "admin", "sessions", "session-length-form.tsx"],
  "module settings": ["app", "admin", "modules", "[id]", "ui.tsx"],
  "module visibility": ["app", "admin", "modules", "[id]", "groups-form.tsx"],
};

describe("settings forms share one save control", () => {
  for (const [label, file] of Object.entries(FORMS)) {
    it(`${label} uses SaveBar`, () => {
      const src = strip(read(...file));
      expect(src, `${label} imports its own save row instead of SaveBar`).toMatch(
        /import \{[^}]*\bSaveBar\b[^}]*\} from "@\/app\/components\/save-bar"/,
      );
      expect(src, `${label} does not render SaveBar`).toMatch(/<SaveBar/);
    });

    it(`${label} seeds its controls from the server on every render`, () => {
      const src = strip(read(...file));
      // `defaultValue: ""` is allowed: it is how a write-only secret is declared, and there is
      // no server value for it to go stale against.
      const stale = src.match(/default(Value|Checked)=\{(?!""\})/g) ?? [];
      expect(stale, `${label} has a control that only reads the server once: ${stale.join(", ")}`)
        .toHaveLength(0);
    });
  }
});

describe("a save does not throw away what was just saved", () => {
  /**
   * The root cause of "clicking save reverts the control".
   *
   * React 19 calls `form.reset()` once a form action resolves, restoring every control to its
   * SERVER-RENDERED default — while React's own state keeps the new value, so it sees no change and
   * never rewrites the DOM. The save worked; only the display lied.
   * ⚠ `preventDefault()` on `reset` is the whole fix, and it must live on `dirtyProps` so every
   * form spreading it is covered by construction rather than by everyone remembering.
   */
  const SRC = strip(read("app", "components", "save-bar.tsx"));

  it("cancels React's post-action form reset", () => {
    expect(SRC, "the reset that reverts every control is not cancelled").toMatch(
      /onReset:\s*\(e\)\s*=>\s*e\.preventDefault\(\)/,
    );
  });

  it("ships the reset guard as part of dirtyProps", () => {
    const props = SRC.match(/dirtyProps:\s*\{[\s\S]*?\n\s{4}\}/)?.[0] ?? "";
    expect(props, "dirtyProps not found").toContain("onInput");
    expect(props, "onReset is not in dirtyProps, so spreading it does not protect a form").toContain(
      "onReset",
    );
  });

  it("gives write-only fields another way to clear", () => {
    // They relied on that reset. Keyed on a generation counter instead, or a typed password
    // would linger in the box after saving.
    expect(SRC).toMatch(/generation/);
  });

  for (const [label, file] of Object.entries(FORMS)) {
    it(`${label} spreads the guard onto its form`, () => {
      const src = strip(read(...file));
      expect(src, `${label} does not spread dirtyProps, so React will reset it on save`).toMatch(
        /<form[^>]*\{\.\.\.dirtyProps\}/,
      );
    });
  }
});

describe("the shared save control", () => {
  const SRC = strip(read("app", "components", "save-bar.tsx"));

  it("says when there are unsaved changes", () => {
    expect(SRC).toMatch(/Not saved yet\./);
  });

  it("only claims a save landed once nothing is edited", () => {
    // A "Saved." next to a field you have since changed is the exact confusion being fixed.
    expect(SRC).toMatch(/!dirty && !pending && success/);
  });

  it("re-seeds a control when the server's value changes", () => {
    expect(SRC, "useServerValue must compare values, not just take the first one").toMatch(
      /Object\.is\(seeded\.current, current\)/,
    );
  });

  it("clears the dirty flag on a new action result rather than on a success flag", () => {
    // Two saves in a row both produce {ok: true}; only the object's identity distinguishes them.
    expect(SRC).toMatch(/seen\.current !== result/);
  });

  /**
   * Owner, 2026-07-28: *"sometimes it takes a few times to select an option before it actually
   * changes."* Both of these were render-phase state updates — a legal React pattern that makes
   * React throw the in-progress render away and replay it, and a `setValue` from the change
   * handler that had not committed yet lost that replay. Measured live: the first interaction
   * with a `<select>` after page load fired a real `change` event and then did not move.
   *
   * The assertion is that neither re-seed happens during render. A bare `if (…) setState()` in a
   * hook body is the shape that regresses this.
   */
  /**
   * A `<select>`'s React `onChange` runs on the DOM `change` event — but the browser fires `input`
   * first, and React processes that one too: seeing the DOM value no longer match its `value` prop,
   * with no state update yet, it **restores the old value**. By the time `change` arrives there is
   * nothing left to report, so `onChange` is suppressed and the selection snaps back.
   *
   * Measured live (2026-07-28): one keypress produced `input` at index 5, then `change` back at
   * index 6, with `onChange` never called.
   */
  it("syncs a select on input as well as change", () => {
    expect(SRC, "selectSync is gone — a controlled select will silently revert").toMatch(
      /export function selectSync/,
    );
    const fn = SRC.slice(SRC.indexOf("export function selectSync"));
    expect(fn, "selectSync must handle input, which arrives before React's restore").toMatch(
      /onInput:/,
    );
    expect(fn).toMatch(/onChange:/);
  });

  it("has no controlled select that syncs on change alone", () => {
    for (const [label, file] of Object.entries(FORMS)) {
      const src = strip(read(...file));
      // A controlled select is `value={…}` on a <select>; each must go through selectSync.
      for (const tag of src.match(/<select[\s\S]*?>/g) ?? []) {
        if (!/\bvalue=\{/.test(tag)) continue; // uncontrolled — nothing to restore against
        expect(tag, `${label} has a controlled <select> not using selectSync`).toMatch(
          /\{\.\.\.selectSync\(/,
        );
      }
    }
  });

  it("re-seeds from effects, never during render", () => {
    const body = SRC.slice(SRC.indexOf("export function useFormDirty"));
    for (const [name, fn] of [
      ["useFormDirty", body.slice(0, body.indexOf("export function useServerValue"))],
      ["useServerValue", SRC.slice(SRC.indexOf("export function useServerValue"))],
    ] as const) {
      expect(fn, `${name} does not re-seed in an effect`).toMatch(/useEffect\(/);
      // A render-phase update reads as a top-level `if` calling a setter, with no `useEffect`
      // between it and the function body.
      const beforeFirstEffect = fn.slice(0, fn.indexOf("useEffect("));
      expect(
        beforeFirstEffect,
        `${name} calls a setter during render — that races the user's own input`,
      ).not.toMatch(/\n\s{2}if \([^)]*\) \{[\s\S]*?set[A-Z]/);
    }
  });
});
