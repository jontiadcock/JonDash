# Designing a JonDash style

A **style** is a complete look for the interface — chrome, not content. The operator picks one in
*Admin → Settings → Branding*, and it changes how everything is drawn without changing what anything
does or where it lives.

This document is the contract. Follow it and a new style takes an afternoon, works everywhere, and can't
break an installed module. Ignore it and you get a style that looks right on two screens and wrong on
twenty.

> **Style vs brand.** A *style* is the chrome (XP, Crystal, …). The *brand* is the operator's own accent
> colour and logo (CORE-06). They compose: every style must look deliberate with any accent.

---

## 1. How a style works

Every style is a block of CSS custom properties scoped to a `data-style` attribute on `<html>`:

```css
:root[data-style="xp"] {
  --background: #3a6ea5;
  --surface: #ece9d8;
  --radius-card: 4px;
  /* …the full token set… */
}
```

The app sets that attribute from the `branding.style` setting. Nothing else changes — no per-page CSS, no
conditional components, no JavaScript branching on the style.

**Why it's done this way:** every screen, and every installed **module**, is built from the same handful of
primitives (`.card`, `.btn`, `.input`) and the same tokens. Redefining the tokens re-skins all of it at
once. A style that reached for a specific page or component would skin the app but leave modules — written
by other people, who have never heard of your style — looking broken.

---

## 2. The token set

A style **must define every token**. Missing ones fall back to the default style, which produces an
incoherent hybrid rather than an obvious failure.

### Colour

| Token | What it is |
| ----- | ---------- |
| `--background` | The page behind everything |
| `--surface` | Cards, panels, menus |
| `--surface-2` | Recessed areas: inputs, hover states, code blocks |
| `--foreground` | Primary text |
| `--muted` | Secondary text, labels, help |
| `--border` | Ordinary dividers |
| `--border-strong` | Emphasised edges, unselected buttons |
| `--primary` | Accent — **usually inherited from the operator's brand, not set by the style** |
| `--primary-foreground` | Text on the accent |
| `--danger` | Destructive actions and errors |
| `--ring` | Focus-ring colour |

### Shape and depth

| Token | What it is |
| ----- | ---------- |
| `--radius-card` | Corner radius for cards and panels |
| `--radius-control` | Corner radius for buttons and inputs |
| `--border-width` | Ordinary border thickness (XP wants 2px bevels; Crystal wants hairlines) |
| `--shadow` | Card elevation |
| `--shadow-control` | Button elevation |
| `--surface-blur` | Backdrop blur for translucent styles; `0` for opaque ones |
| `--surface-gradient` | Optional gradient overlay for a surface; `none` when flat |

### Type

| Token | What it is |
| ----- | ---------- |
| `--font-sans` | UI typeface |
| `--font-weight-strong` | What "bold" means here |

**Do not add tokens for one style's benefit** without adding them to this table and giving every other
style a sensible value. An orphan token is how styles start diverging.

---

## 3. What a style may not do

These aren't stylistic preferences — breaking them breaks other people's modules or shuts users out.

1. **No layout changes.** Spacing scale, grid columns, widths and the position of anything are fixed. A
   style changes how a card *looks*, never where it *is*. (A user's dashboard arrangement is their own
   setting; a style must not fight it.)
2. **Never target a page, route or component.** No `.dashboard .card`, no `#admin-nav`. Tokens and the
   shared primitives only.
3. **Never change hit-target size.** Padding on `.btn` and `.input` is fixed; shrinking it to look sleek
   makes the app worse on touch.
4. **Never remove the focus ring.** It may be restyled to suit the look, but tabbing must always show
   clearly where you are.
5. **Never assume the accent.** The operator's colour lands in `--primary`. A style that hardcodes its own
   accent throws their branding away.
6. **No remote assets.** No web fonts, no CDN images, no external anything — the Content-Security-Policy
   forbids it and self-hosting is the point. Use system font stacks and CSS-drawn effects.

---

## 4. The accessibility floor

A style that fails any of these is not shipped. They are cheap to check and expensive to discover later.

- **Text contrast ≥ 4.5:1** against its own surface (`--foreground` on `--surface`, `--muted` on
  `--surface`, `--primary-foreground` on `--primary`). Large headings may use 3:1.
- **The focus ring is visible** against every surface it can appear on.
- **Nothing is conveyed by colour alone** — a style may not remove an icon or label that carries meaning.
- **Translucency stays legible.** Blur and transparency are decorative; text over them must still clear the
  contrast floor at the *worst-case* backdrop, not a flattering one.
- **Respect `prefers-reduced-motion`** for any animation the style adds.

---

## 5. Light and dark

Two options, and a style must declare which it is:

- **Adaptive** — define the tokens twice, once for light and once inside
  `@media (prefers-color-scheme: dark)`. Preferred.
- **Committed** — the style *is* a specific look (XP's grey-and-blue is not meaningfully "dark mode"), so it
  defines one palette and ignores the system preference. Say so in the style's description, so nobody
  reports it as a bug.

---

## 6. Adding a style — the checklist

1. Add the id to the `branding.style` setting's allowed values, with a human name and one-line description.
2. Add a `:root[data-style="<id>"] { … }` block defining **every** token in §2.
3. If the style needs decorative flourishes (bevels, gloss, glass), add them **to the shared primitives
   only**, scoped by the same attribute:
   `:root[data-style="<id>"] .btn { … }`.
4. Check it against §3 and §4. Actually check the contrast — don't estimate it.
5. Look at it with **a module installed**, not just core screens. That's the case the rules exist for.
6. Look at it at **375px wide**, and in both light and dark if it's adaptive.
7. Screenshot it for the changelog entry.

---

## 7. Why not a theme file or a plugin?

Considered and rejected for now:

- **Styles as uploadable files** — that's arbitrary CSS from outside, which is a code-execution-adjacent
  surface on a security-first app. Styles ship with JonDash and are reviewed like any other code.
- **Styles as modules** — modules are sandboxed to their own pages by design; a style is deliberately
  global. Making styles a module capability would hand any installed module control of the whole UI.

If either is revisited, it needs its own security review, not an extension of this document.
