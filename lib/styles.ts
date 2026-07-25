/**
 * The interface styles JonDash ships (CORE-07) — see docs/STYLES.md.
 *
 * **A style is STRUCTURE; a palette is COLOUR.** Radius, borders, shadows, blur, bevels and
 * fonts belong to the style — they're what make XP feel like XP. The colours filling that
 * structure are a palette, and one style can offer several.
 *
 * This split came from noticing that several "styles" were the same structure repainted:
 * Nord and Solarized were literally Modern with different colours. Keeping them separate
 * meant duplicating the whole token set to change a handful of values, and the picker filled
 * up with things that looked like variants because they *were* variants.
 *
 * Deliberately NOT in the `"use client"` picker component: a server component importing a
 * plain value from a client module gets a client reference rather than the value, so the
 * settings page rendered "This style settings" instead of "Modern settings".
 */

export type Palette = {
  id: string;
  name: string;
  /** Preview colours — mirror what the palette actually sets in styles.css. */
  bg: string;
  surface: string;
  accent: string;
  text: string;
};

export type StyleOption = {
  id: string;
  name: string;
  family: "Standard" | "Retro" | "Glass" | "Bold";
  description: string;
  /** Structure preview; colours come from the selected palette. */
  swatch: { radius: string; border: string; titleBar?: boolean; font?: string; fat?: boolean };
  palettes: Palette[];
};

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
    // Glass, but a different glass: Windows 7 framed its panels and squared them off, where
    // Crystal is frameless and pill-shaped. It was briefly a Crystal *palette* and had to
    // override radius, blur and the typeface to look right — which is the tell that it was a
    // style all along (docs/STYLES.md §2).
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
    // Also promoted out of being a Modern palette, for the same reason as Aero: it was
    // overriding shadow and radius. What actually makes it Paper is a serif face and the
    // absence of elevation — printed matter doesn't float — and neither is a colour.
    description: "Ink on stock: a serif face, hairline rules and no shadows anywhere. One committed look — it ignores dark mode.",
    swatch: { radius: "0px", border: "#cdc8bb", font: "Georgia, serif" },
    palettes: [
      { id: "newsprint", name: "Newsprint", bg: "#e9e7e1", surface: "#fdfcf9", accent: "#14110c", text: "#14110c" },
      { id: "sepia", name: "Sepia", bg: "#e8dcc4", surface: "#fbf5e9", accent: "#4a3418", text: "#3b2b17" },
      { id: "ink", name: "Ink", bg: "#e4e4e4", surface: "#ffffff", accent: "#000000", text: "#000000" },
    ],
  },
];

/** Styles grouped by family, for the picker. */
export function stylesByFamily(): { family: string; styles: StyleOption[] }[] {
  const order: StyleOption["family"][] = ["Standard", "Glass", "Retro", "Bold"];
  return order
    .map((family) => ({ family, styles: STYLES.filter((s) => s.family === family) }))
    .filter((g) => g.styles.length > 0);
}

export function findStyle(id: string): StyleOption {
  return STYLES.find((s) => s.id === id) ?? STYLES[0];
}

/**
 * The palette to use for a style: the requested one if it belongs to that style, otherwise
 * the style's first.
 *
 * A palette id only means something inside its style — "cyan" exists for both Terminal and
 * Brutalist and is a different colour in each — so changing style must never carry a stale
 * pairing through.
 */
export function resolvePalette(styleId: string, paletteId: string): Palette {
  const style = findStyle(styleId);
  return style.palettes.find((p) => p.id === paletteId) ?? style.palettes[0];
}

/**
 * Pairings that MOVED between releases, old → new.
 *
 * Reorganising the catalogue is otherwise silently destructive: `resolvePalette` falls back
 * to the style's first palette, so someone on Crystal · Aero would have been dropped onto
 * Crystal · Aurora — a look they never chose — rather than onto the Aero style their setting
 * plainly names. Falling back is the right behaviour for a pairing that no longer exists;
 * it's the wrong behaviour for one that simply lives somewhere else now.
 *
 * Keep entries here permanently. They cost nothing and an instance can update from any age.
 */
const MOVED: Record<string, { style: string; palette: string }> = {
  // 1.7.0-beta.10: Aero was promoted out of Crystal into its own Glass style — it had been
  // overriding radius, blur and the typeface, which is the definition of a style, not a palette.
  "crystal:aero": { style: "aero", palette: "sky" },
  // 1.7.0-beta.10: likewise Paper out of Modern — it was overriding shadow and radius, and it
  // gained a serif face on promotion.
  "default:paper": { style: "paper", palette: "newsprint" },
};

/**
 * The style + palette actually to apply, given what's stored. Applies any move, then
 * normalises the palette against the resulting style.
 *
 * This is the single choke point — the layout, the settings page and the save action all go
 * through it, so a stored pairing can never mean one thing in the picker and another on screen.
 */
export function resolveStylePair(styleId: string, paletteId: string): { style: string; palette: string } {
  const moved = MOVED[`${styleId}:${paletteId}`];
  const style = moved ? moved.style : styleId;
  const palette = resolvePalette(style, moved ? moved.palette : paletteId).id;
  // A style id that no longer exists falls back too — findStyle already guarantees that.
  return { style: findStyle(style).id, palette };
}

/** Every valid "<style>:<palette>" pairing, for validating what's stored. */
export function validPairings(): string[] {
  return STYLES.flatMap((s) => s.palettes.map((p) => `${s.id}:${p.id}`));
}

/** id → display name, for labelling the style-specific settings block. */
export const STYLE_NAMES: Record<string, string> = Object.fromEntries(
  STYLES.map((s) => [s.id, s.name]),
);
