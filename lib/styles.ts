/**
 * The interface styles JonDash ships (CORE-07) — see docs/STYLES.md.
 *
 * Deliberately NOT in the `"use client"` picker component: a server component importing a
 * plain value from a client module gets a client reference rather than the value, so the
 * settings page rendered "This style settings" instead of "Modern settings". Shared data
 * belongs in a shared, non-client module.
 *
 * Each entry's swatch previews the style using its own values, so the preview can't drift
 * from the real thing. Adding a style: docs/STYLES.md §6.
 */
export type StyleOption = {
  id: string;
  name: string;
  description: string;
  swatch: { bg: string; surface: string; accent: string; radius: string; border: string };
};

export const STYLES: StyleOption[] = [
  {
    id: "default",
    name: "Modern",
    description: "The standard look — soft cards, rounded corners. Follows your system light/dark setting.",
    swatch: { bg: "#f6f7fb", surface: "#ffffff", accent: "#4f46e5", radius: "10px", border: "#e2e5ee" },
  },
  {
    id: "xp",
    name: "XP",
    description: "Bevelled buttons, tan panels and a bright blue desktop. One committed look — it ignores dark mode.",
    swatch: { bg: "#5a7edc", surface: "#ece9d8", accent: "#245edb", radius: "3px", border: "#716f64" },
  },
  {
    id: "crystal",
    name: "Crystal",
    description: "Translucent frosted-glass panels over a soft gradient. Follows your system light/dark setting.",
    swatch: { bg: "#dbe4f5", surface: "rgba(255,255,255,0.75)", accent: "#0b7285", radius: "18px", border: "rgba(255,255,255,0.8)" },
  },
];

/** id → display name, for labelling the style-specific settings block. */
export const STYLE_NAMES: Record<string, string> = Object.fromEntries(
  STYLES.map((s) => [s.id, s.name]),
);
