import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  STYLES,
  findStyle,
  resolvePalette,
  resolveStylePair,
  stylesByFamily,
  validPairings,
  STYLE_NAMES,
} from "@/lib/styles";
import { STYLE_SETTINGS } from "@/lib/settings";

/**
 * The style system (CORE-07) has three sources of truth that must agree: the catalogue in
 * `lib/styles.ts`, the CSS in `app/styles.css`, and the `branding.style` enum in
 * `lib/settings.ts`. Nothing at runtime notices when they drift — a style missing its CSS
 * just renders as the base look, which is easy to miss and hard to attribute.
 */
const CSS = fs.readFileSync(path.join(process.cwd(), "app", "styles.css"), "utf8");

describe("style catalogue", () => {
  it("gives every style at least one palette", () => {
    for (const s of STYLES) expect(s.palettes.length, `${s.id} has no palettes`).toBeGreaterThan(0);
  });

  it("has no duplicate style ids, and no duplicate palette ids within a style", () => {
    expect(new Set(STYLES.map((s) => s.id)).size).toBe(STYLES.length);
    for (const s of STYLES) {
      expect(new Set(s.palettes.map((p) => p.id)).size, `${s.id} repeats a palette id`).toBe(s.palettes.length);
    }
  });

  it("puts every style in a family the picker renders", () => {
    const grouped = stylesByFamily().flatMap((g) => g.styles.map((s) => s.id));
    expect(grouped.sort()).toEqual(STYLES.map((s) => s.id).sort());
  });

  it("declares every style in the branding.style setting and in STYLE_SETTINGS", () => {
    for (const s of STYLES) {
      expect(STYLE_SETTINGS[s.id], `${s.id} missing from STYLE_SETTINGS`).toBeDefined();
      expect(STYLE_NAMES[s.id]).toBe(s.name);
    }
  });
});

describe("style CSS is actually present", () => {
  // The base style is the plain :root block in globals.css, so it's exempt here.
  const needsCss = STYLES.filter((s) => s.id !== "default");

  it("has a token block for every non-default style", () => {
    for (const s of needsCss) {
      expect(CSS.includes(`[data-style="${s.id}"] {`), `no CSS block for style "${s.id}"`).toBe(true);
    }
  });

  it("has a block for every non-default palette of a non-default style", () => {
    for (const s of needsCss) {
      // The first palette is carried by the style's own block; the rest must override.
      for (const p of s.palettes.slice(1)) {
        expect(
          CSS.includes(`[data-style="${s.id}"][data-palette="${p.id}"]`),
          `no CSS for palette "${s.id}/${p.id}"`,
        ).toBe(true);
      }
    }
  });

  it("defines the motion tokens for every non-default style", () => {
    // A style that skips these inherits Modern's easing and feels wrong (docs/STYLES.md §6).
    for (const s of needsCss) {
      const block = CSS.slice(CSS.indexOf(`[data-style="${s.id}"] {`));
      const body = block.slice(0, block.indexOf("}"));
      expect(body.includes("--motion-fast"), `${s.id} sets no --motion-fast`).toBe(true);
      expect(body.includes("--motion-spin"), `${s.id} sets no --motion-spin`).toBe(true);
    }
  });

  it("never sets --motion-spin to none — Tailwind's animate-spin reads it, including in modules", () => {
    expect(/--motion-spin:\s*none/.test(CSS)).toBe(false);
  });
});

describe("resolvePalette", () => {
  it("keeps a palette that belongs to the style", () => {
    expect(resolvePalette("xp", "olive").id).toBe("olive");
  });

  it("falls back to the style's first palette when the pairing is invalid", () => {
    // "olive" is XP's; it means nothing under Terminal.
    expect(resolvePalette("terminal", "olive").id).toBe(STYLES.find((s) => s.id === "terminal")!.palettes[0].id);
  });

  it("resolves the same id differently per style — a palette id is not global", () => {
    // "cyan" exists for both Terminal and Brutalist and is a different colour in each.
    expect(resolvePalette("terminal", "cyan").accent).not.toBe(resolvePalette("brutalist", "cyan").accent);
  });

  it("falls back to the default style for an unknown style id", () => {
    expect(findStyle("no-such-style").id).toBe(STYLES[0].id);
  });
});

describe("resolveStylePair — pairings that moved between releases", () => {
  it("carries Crystal/Aero across to the Aero style rather than dropping it on Aurora", () => {
    // Aero was promoted out of Crystal in 1.7.0-beta.10. Plain resolvePalette would land on
    // Crystal's first palette — a look the operator never chose.
    expect(resolvePalette("crystal", "aero").id).toBe("aurora"); // the behaviour being corrected
    expect(resolveStylePair("crystal", "aero")).toEqual({ style: "aero", palette: "sky" });
  });

  it("carries Modern/Paper across to the Paper style", () => {
    expect(resolveStylePair("default", "paper")).toEqual({ style: "paper", palette: "newsprint" });
  });

  it("leaves a pairing that didn't move alone", () => {
    expect(resolveStylePair("xp", "silver")).toEqual({ style: "xp", palette: "silver" });
  });

  it("still normalises a genuinely invalid pairing", () => {
    expect(resolveStylePair("brutalist", "luna")).toEqual({ style: "brutalist", palette: "yellow" });
  });

  it("always returns a pairing that exists", () => {
    const valid = new Set(validPairings());
    for (const input of [["crystal", "aero"], ["nope", "nope"], ["aero", "luna"], ["", ""]] as const) {
      const r = resolveStylePair(input[0], input[1]);
      expect(valid.has(`${r.style}:${r.palette}`), `${input.join("/")} → ${r.style}:${r.palette}`).toBe(true);
    }
  });
});

describe("picker previews match the CSS", () => {
  it("gives every palette a swatch with real colour values", () => {
    for (const s of STYLES) {
      for (const p of s.palettes) {
        for (const key of ["bg", "surface", "accent", "text"] as const) {
          expect(p[key], `${s.id}/${p.id}.${key} is empty`).toBeTruthy();
          expect(/^(#|rgba?\()/.test(p[key]), `${s.id}/${p.id}.${key} isn't a colour`).toBe(true);
        }
      }
    }
  });
});
