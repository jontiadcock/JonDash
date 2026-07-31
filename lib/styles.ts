/**
 * The interface styles JonDash ships (CORE-07) — see docs/STYLES.md.
 *
 * ⚠ A style is STRUCTURE; a palette is COLOUR. Radius, borders, shadows, blur, bevels and fonts
 * belong to the style; anything that is only a colour is a palette of an existing style. Getting
 * that wrong duplicates the whole token set to change a handful of values.
 * ⚠ Keep this out of the `"use client"` picker. A server component importing a plain value from a
 * client module gets a client REFERENCE, not the value — the settings page rendered "This style
 * settings" instead of "Modern settings".
 *
 * REFS app/globals.css · app/styles.css — every id here needs a matching `[data-style=…]` block
 *      app/layout.tsx — sets that attribute · app/admin/settings/style-form.tsx — the picker
 * PINS tests/unit/styles.test.ts · tests/unit/dashboard-paint.test.ts
 */

/** REFS app/styles.css — every id here needs a `[data-palette=…]` block · lib/settings.ts */
export type Palette = {
  id: string;
  name: string;
  /** Preview colours — mirror what the palette actually sets in styles.css. */
  bg: string;
  surface: string;
  accent: string;
  text: string;
};

/** REFS app/admin/settings/style-form.tsx — renders the swatch from these fields alone */
export type StyleOption = {
  id: string;
  name: string;
  family: "Standard" | "Retro" | "Glass" | "Bold";
  description: string;
  /** Structure preview; colours come from the selected palette. */
  swatch: { radius: string; border: string; titleBar?: boolean; font?: string; fat?: boolean };
  palettes: Palette[];
};

/**
 * ⚠ The catalogue. Adding a style needs a matching `[data-style=…]` block in app/styles.css, and
 * MOVING a palette between styles needs an entry in `MOVED` below or existing users lose their
 * look. REFS app/styles.css · app/globals.css — the CSS side · app/layout.tsx — sets the attributes
 *      app/admin/settings/style-form.tsx — the picker · lib/settings.ts — what is stored
 * PINS tests/unit/styles.test.ts · tests/unit/dashboard-paint.test.ts · email-template.test.ts
 */
export const STYLES: StyleOption[] = [
  {
    id: "default",
    name: "Modern",
    family: "Standard",
    description: "Soft cards, rounded corners and gentle shadows. Follows your system light/dark setting.",
    swatch: { radius: "10px", border: "#e2e5ee" },
    palettes: [
      { id: "indigo", name: "Indigo", bg: "#f6f7fb", surface: "#ffffff", accent: "#4f46e5", text: "#16181d" },
      { id: "nord", name: "Nord", bg: "#eceff4", surface: "#ffffff", accent: "#5e81ac", text: "#2e3440" },
      { id: "solarized", name: "Solarized", bg: "#eee8d5", surface: "#fdf6e3", accent: "#1d7fbe", text: "#073642" },
    ],
  },
  {
    id: "crystal",
    name: "Crystal",
    family: "Glass",
    description: "Frosted-glass panels over a soft gradient, with pill-shaped controls. Follows your system light/dark setting.",
    swatch: { radius: "18px", border: "rgba(255,255,255,0.85)" },
    palettes: [
      { id: "aurora", name: "Aurora", bg: "#dbe4f5", surface: "rgba(255,255,255,0.9)", accent: "#0b7285", text: "#0b0e14" },
      { id: "neon", name: "Neon", bg: "#12082a", surface: "#231146", accent: "#ff56c8", text: "#f4ecff" },
    ],
  },
  {
    id: "aero",
    name: "Aero",
    family: "Glass",
    // Was briefly a Crystal PALETTE and had to override radius, blur and the typeface to look
    // right — the tell that it is a style. REFS MOVED below carries those users across
    description: "Framed glass with a sheen, squared-off panels and gradient buttons. One committed look — it ignores dark mode.",
    swatch: { radius: "7px", border: "#7fa8cc", font: "'Segoe UI', Tahoma, sans-serif" },
    palettes: [
      { id: "sky", name: "Sky", bg: "#c3daf1", surface: "rgba(255,255,255,0.9)", accent: "#1f7fd6", text: "#10243a" },
      { id: "twilight", name: "Twilight", bg: "#cdc4ea", surface: "rgba(255,255,255,0.9)", accent: "#6d4fc4", text: "#1d1533" },
      { id: "slate", name: "Slate", bg: "#c9d0d8", surface: "rgba(255,255,255,0.9)", accent: "#4a5b70", text: "#1b2129" },
    ],
  },
  {
    id: "xp",
    name: "XP",
    family: "Retro",
    description: "Title bars on every panel, bevelled buttons and sunken fields. One committed look — it ignores dark mode.",
    swatch: { radius: "3px", border: "#0831d9", titleBar: true, font: "Tahoma, sans-serif" },
    palettes: [
      { id: "luna", name: "Luna Blue", bg: "#4b7fdc", surface: "#ece9d8", accent: "#245edb", text: "#000000" },
      { id: "olive", name: "Olive Green", bg: "#7a9153", surface: "#ece9d8", accent: "#5c7a2e", text: "#000000" },
      { id: "silver", name: "Silver", bg: "#8f92a1", surface: "#eeeef2", accent: "#5a5d70", text: "#000000" },
    ],
  },
  {
    id: "terminal",
    name: "Terminal",
    family: "Retro",
    description: "Monospace throughout, hard edges, no shadows. One committed look — it ignores dark mode.",
    swatch: { radius: "0px", border: "#2f8f4a", font: "ui-monospace, Consolas, monospace" },
    palettes: [
      { id: "green", name: "Phosphor Green", bg: "#050805", surface: "#0a120a", accent: "#7dffa8", text: "#7dffa8" },
      { id: "amber", name: "Amber", bg: "#0a0703", surface: "#150f05", accent: "#ffb44d", text: "#ffb44d" },
      { id: "cyan", name: "Cyan", bg: "#03080a", surface: "#061418", accent: "#5fe3ff", text: "#5fe3ff" },
    ],
  },
  {
    id: "brutalist",
    name: "Brutalist",
    family: "Bold",
    description: "Fat black borders, zero radius and hard offset shadows. Loud, flat and very legible.",
    swatch: { radius: "0px", border: "#000000", fat: true },
    palettes: [
      { id: "yellow", name: "Yellow", bg: "#f5e600", surface: "#ffffff", accent: "#0033ff", text: "#000000" },
      { id: "cyan", name: "Cyan", bg: "#00e5ff", surface: "#ffffff", accent: "#d92b00", text: "#000000" },
      { id: "mono", name: "Mono", bg: "#d9d9d9", surface: "#ffffff", accent: "#000000", text: "#000000" },
    ],
  },
  {
    id: "paper",
    name: "Paper",
    family: "Bold",
    // Also promoted out of being a Modern palette: it was overriding shadow and radius, and
    // what makes it Paper is a serif face and no elevation — neither of which is a colour.
    description: "Ink on stock: a serif face, hairline rules and no shadows anywhere. One committed look — it ignores dark mode.",
    swatch: { radius: "0px", border: "#cdc8bb", font: "Georgia, serif" },
    palettes: [
      { id: "newsprint", name: "Newsprint", bg: "#e9e7e1", surface: "#fdfcf9", accent: "#14110c", text: "#14110c" },
      { id: "sepia", name: "Sepia", bg: "#e8dcc4", surface: "#fbf5e9", accent: "#4a3418", text: "#3b2b17" },
      { id: "ink", name: "Ink", bg: "#e4e4e4", surface: "#ffffff", accent: "#000000", text: "#000000" },
    ],
  },
];

/** Styles grouped by family, for the picker.
 *  REFS app/admin/settings/style-form.tsx — the only caller  PINS tests/unit/styles.test.ts */
export function stylesByFamily(): { family: string; styles: StyleOption[] }[] {
  const order: StyleOption["family"][] = ["Standard", "Glass", "Retro", "Bold"];
  return order
    .map((family) => ({ family, styles: STYLES.filter((s) => s.family === family) }))
    .filter((g) => g.styles.length > 0);
}

/** ⚠ Falls back to the first style rather than throwing — an unknown id must not blank the UI.
 *  REFS app/admin/settings/style-form.tsx  PINS tests/unit/styles.test.ts */
export function findStyle(id: string): StyleOption {
  return STYLES.find((s) => s.id === id) ?? STYLES[0];
}

/**
 * The palette for a style: the requested one if it belongs to that style, otherwise the style's
 * first. ⚠ A palette id only means something INSIDE its style — "cyan" exists for Terminal and for
 * Brutalist and is a different colour in each — so a style change must never carry a stale pairing.
 *
 * REFS app/components/branding.tsx · lib/email/template.ts · lib/settings.ts ·
 *      app/admin/settings/actions.ts · style-form.tsx  PINS tests/unit/styles.test.ts
 */
export function resolvePalette(styleId: string, paletteId: string): Palette {
  const style = findStyle(styleId);
  return style.palettes.find((p) => p.id === paletteId) ?? style.palettes[0];
}

/**
 * Pairings that MOVED between releases, old → new.
 *
 * ⚠ Add an entry whenever a palette is promoted to a style, or reorganising the catalogue is
 * silently destructive: `resolvePalette` would drop that user onto the old style's FIRST palette —
 * a look they never chose — instead of the style their setting plainly names.
 * ⚠ Keep every entry permanently. They cost nothing and an instance can update from any age.
 * REFS resolveStylePair() below — the only reader
 */
const MOVED: Record<string, { style: string; palette: string }> = {
  // Aero was promoted out of Crystal into its own Glass style.
  "crystal:aero": { style: "aero", palette: "sky" },
  // Likewise Paper out of Modern; it gained a serif face on promotion.
  "default:paper": { style: "paper", palette: "newsprint" },
};

/**
 * The style + palette actually to apply, given what is stored: applies any move, then normalises
 * the palette against the resulting style.
 *
 * ⚠ The single choke point. Every surface must resolve through it, or a stored pairing means one
 * thing in the picker and another on screen.
 * REFS app/components/branding.tsx › styleId() · paletteId() — the render path
 *      app/admin/settings/page.tsx · lib/email/template.ts › currentBrand()
 * PINS tests/unit/styles.test.ts
 */
export function resolveStylePair(styleId: string, paletteId: string): { style: string; palette: string } {
  const moved = MOVED[`${styleId}:${paletteId}`];
  const style = moved ? moved.style : styleId;
  const palette = resolvePalette(style, moved ? moved.palette : paletteId).id;
  // A style id that no longer exists falls back too — `findStyle` guarantees that.
  return { style: findStyle(style).id, palette };
}

/** Every valid "<style>:<palette>" pairing, for validating what is stored.
 *  PINS tests/unit/styles.test.ts — the only caller; asserts MOVED entries stay resolvable */
export function validPairings(): string[] {
  return STYLES.flatMap((s) => s.palettes.map((p) => `${s.id}:${p.id}`));
}

/** id → display name, for labelling the style-specific settings block.
 *  REFS app/admin/settings/page.tsx  PINS tests/unit/styles.test.ts */
export const STYLE_NAMES: Record<string, string> = Object.fromEntries(
  STYLES.map((s) => [s.id, s.name]),
);
