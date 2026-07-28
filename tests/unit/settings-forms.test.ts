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
   * The measured root cause of *"when clicking save, the button reverts"* (1.8.0-beta.11).
   *
   * React 19 calls `form.reset()` once a form action resolves. A reset restores every control to
   * its **server-rendered** default, so the control you just changed snaps back to the value the
   * page loaded with — and because React's own state still holds the new value, React sees no
   * change and never rewrites the DOM. Verified live: after saving, React's prop read `1440`
   * while the DOM read `480`. The save had worked; only the display lied.
   *
   * `reset` is cancelable, so `preventDefault()` on it is the entire fix — and it must be on
   * `dirtyProps`, so every form that spreads it is covered by construction rather than by
   * everyone remembering.
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
      /Object\.is\(seeded, current\)/,
    );
  });

  it("clears the dirty flag on a new action result rather than on a success flag", () => {
    // Two saves in a row both produce {ok: true}; only the object's identity distinguishes them.
    expect(SRC).toMatch(/seen !== result/);
  });
});
