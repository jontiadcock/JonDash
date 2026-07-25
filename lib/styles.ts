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
      { id: "paper", name: "Paper", bg: "#e9e7e1", surface: "#fdfcf9", accent: "#14110c", text: "#14110c" },
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
      { id: "aero", name: "Aero", bg: "#c3daf1", surface: "rgba(255,255,255,0.9)", accent: "#1f7fd6", text: "#10243a" },
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

/** Every valid "<style>:<palette>" pairing, for validating what's stored. */
export function validPairings(): string[] {
  return STYLES.flatMap((s) => s.palettes.map((p) => `${s.id}:${p.id}`));
}

/** id → display name, for labelling the style-specific settings block. */
export const STYLE_NAMES: Record<string, string> = Object.fromEntries(
  STYLES.map((s) => [s.id, s.name]),
);
