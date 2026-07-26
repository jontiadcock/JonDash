# Designing a JonDash style

A **style** is a complete look for the interface — chrome, not content. The operator picks one in
*Admin → Settings → Appearance*, and it changes how everything is drawn without changing what anything
does or where it lives.

This document is the contract. Follow it and a new style takes an afternoon, works everywhere, and can't
break an installed module. Ignore it and you get a style that looks right on two screens and wrong on
twenty.

---

## 0. Style, palette, brand — three different things

Getting these confused is the single most common mistake, so they are separated in the code, in the
settings page, and here.

| | What it is | Who owns it | Example |
| --- | --- | --- | --- |
| **Style** | **Structure.** Radius, borders, shadows, blur, bevels, fonts, chrome. | JonDash | XP has title bars on every panel |
| **Palette** | **Colour.** Which hues fill that structure. | JonDash, per style | XP's *Luna Blue* vs *Olive Green* |
| **Brand** | The operator's own **identity**: app name and logo. | The operator | "Bob's Dashboard", with Bob's logo |

**A palette belongs to exactly one style.** `cyan` exists for both Terminal and Brutalist and is a
completely different colour in each; a palette id means nothing on its own.

**Why the split exists.** Several early "styles" turned out to be the same structure repainted — Nord and
Solarized were literally Modern with different colours. Keeping them as separate styles meant duplicating
the entire token set to change a handful of values, and the picker filled up with entries that looked like
variants because they *were* variants. Now a style is defined once and offers as many palettes as it wants.

**The brand composes with both.** The app name and logo carry across every style and palette unchanged —
that's the point of them.

---

## 1. How it works

Two attributes on `<html>`, set from the `branding.style` and `branding.palette` settings:

```html
<html data-style="xp" data-palette="olive">
```

The CSS is two layers. The **style layer** defines the full token set — everything structural, plus a
default palette:

```css
:root[data-style="xp"] {
  --radius-card: 4px;
  --border-width: 2px;
  --font-sans: Tahoma, "Segoe UI", sans-serif;
  --surface: #ece9d8;
  --xp-bar-1: #2a5fdb;   /* style-private token, see §2 */
  /* …the full token set… */
}
```

The **palette layer** then overrides only the colours, and only for that style:

```css
:root[data-style="xp"][data-palette="olive"] {
  --xp-bar-1: #7d9b4e;
  --xp-desk-1: #6f8c46;
}
```

Two attributes always beat one on specificity, so the palette wins without `!important` and without
repeating anything structural.

**Modern's `indigo` palette is the base**: it lives in `app/globals.css` as the plain `:root` tokens, and the
other Modern palettes override from there. Every other style declares its own tokens in `app/styles.css`.

**Nothing else changes** — no per-page CSS, no conditional components, no JavaScript branching on the
style. Every screen, and every installed **module**, is built from the same primitives (`.card`, `.btn`,
`.input`) and the same tokens, so redefining the tokens re-skins all of it at once. A style that reached
for a specific page or component would skin the app but leave modules — written by other people, who have
never heard of your style — looking broken.

**The catalogue is `lib/styles.ts`.** It carries every style, its family, its description and its palettes,
including the swatch colours the picker previews. The picker draws itself from that data, so a preview
can't drift from the real thing.

---

## 2. The token set

A style **must define every token**. Missing ones fall back to the base, which produces an incoherent
hybrid rather than an obvious failure.

### Colour — a palette may override these

| Token | What it is |
| ----- | ---------- |
| `--background` | The page behind everything |
| `--surface` | Cards, panels, menus |
| `--surface-2` | Recessed areas: inputs, hover states, code blocks |
| `--foreground` | Primary text |
| `--muted` | Secondary text, labels, help |
| `--border` | Ordinary dividers |
| `--border-strong` | Emphasised edges, unselected buttons |
| `--primary` | The style's accent |
| `--primary-foreground` | Text on the accent |
| `--danger` | Destructive actions and errors |
| `--ring` | Focus-ring colour |

### Structure — a palette must **not** touch these

| Token | What it is |
| ----- | ---------- |
| `--radius-card` | Corner radius for cards and panels |
| `--radius-control` | Corner radius for buttons and inputs |
| `--border-width` | Ordinary border thickness (XP wants 2px bevels; Crystal wants hairlines) |
| `--shadow` | Card elevation |
| `--shadow-hover` | Elevation for a `.lift` card under the cursor (§6) |
| `--shadow-control` | Button elevation |
| `--surface-blur` | Backdrop blur for translucent styles; `0` for opaque ones |
| `--surface-gradient` | Optional gradient overlay for a surface; `none` when flat |
| `--font-sans` | UI typeface |
| `--font-weight-strong` | What "bold" means here |
| `--motion-*` | Timing, easing and travel — six tokens, all covered in §6 |

If a palette changes structure it stops being a palette and should be its own style. The test: *could a
screenshot of palette A be mistaken for a screenshot of palette B with different colours?* If yes, it's a
palette.

**This has already happened twice, and the tell was the same both times.** Aero shipped as a Crystal
palette and Paper as a Modern one; both had to override radius and shadow (Aero also blur and the
typeface) to look right. Overriding a structure token from a palette block is the smell — if you find
yourself doing it, you are writing a style. Both were promoted in 1.7.0-beta.10; see §10 for how the
operators on them were carried across.

### Style-private tokens

A style with chrome the shared tokens don't describe may define its own, **prefixed with the style id** so
they can't collide: XP uses `--xp-bar-1/2/3` for the title-bar gradient, `--xp-frame` for the window frame
and `--xp-desk-1/2/3` for the desktop.

**This is what makes a palette possible.** Hard-coding XP's blue into `.card::before` would have meant
Olive Green needed its own copy of every rule. Named tokens mean a palette is a handful of lines.

**Do not add *shared* tokens for one style's benefit** without adding them to the tables above and giving
every other style a sensible value. An orphan token is how styles start diverging.

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
5. **Own your palette — and offer alternatives rather than a free accent.** A style's colours are part of
   its identity. Where a style could reasonably be several colours, ship those as *palettes*, not as a
   colour picker. (Revised 2026-07-25. This originally said a style should inherit a global accent; that
   was silently ignored by every style except Modern, because `:root[data-style=…]` outranks a `:root`
   override on specificity — so the setting appeared to do nothing. Palettes are the honest version of
   what that setting was reaching for.)
6. **No remote assets.** No web fonts, no CDN images, no external anything — the Content-Security-Policy
   forbids it and self-hosting is the point. Use system font stacks and CSS-drawn effects.

---

## 4. The accessibility floor

A style that fails any of these is not shipped, and it must hold for **every palette**, not just the
default one. They are cheap to check and expensive to discover later.

- **Text contrast ≥ 4.5:1** against its own surface (`--foreground` on `--surface`, `--muted` on
  `--surface`, `--primary-foreground` on `--primary`). Large headings may use 3:1.
- **The focus ring is visible** against every surface it can appear on.
- **Nothing is conveyed by colour alone** — a style may not remove an icon or label that carries meaning.
- **Translucency stays legible.** Blur and transparency are decorative; text over them must still clear the
  contrast floor at the *worst-case* backdrop, not a flattering one. Crystal's Aero palette had to have its
  desktop lightened for exactly this reason — dark navy text over a mid-blue gradient was borderline.
- **Respect `prefers-reduced-motion`** for any animation the style adds.

A palette is where contrast bugs actually come from. Structure rarely regresses; a new set of hues does.

---

## 5. Light and dark

Two options, and a style must declare which it is:

- **Adaptive** — define the tokens twice, once for light and once inside
  `@media (prefers-color-scheme: dark)`. Preferred. Modern and Crystal are adaptive.
- **Committed** — the style *is* a specific look (XP's grey-and-blue is not meaningfully "dark mode"), so
  it defines one palette and ignores the system preference. Say so in the style's `description`, so nobody
  reports it as a bug. XP, Aero, Terminal, Brutalist and Paper are committed.

**A palette may be committed inside an adaptive style.** Crystal's Neon is dark whatever the system says —
that's the palette's whole identity. When it does this it must handle *both* system settings, which means
a `@media (prefers-color-scheme: light)` block that re-asserts the dark values; otherwise it inherits the
style's light tokens and comes out half-repainted.

---

## 6. Motion

**How the interface moves is part of a style, not a global constant.** XP had no compositor: a window was
either up or it wasn't, and a button swapped its bevel the instant you pressed it. Crystal is glass, and
glass should feel unhurried. Getting this wrong is what makes a retro style read as a modern app wearing a
costume — the corners are right and it still *feels* like 2026.

### The tokens

| Token | What it is |
| ----- | ---------- |
| `--motion-fast` | Hover, focus, small state changes. `0ms` means "no transition". |
| `--motion-slow` | Anything that travels: page enter, drawer slide |
| `--motion-ease` | The timing function. `linear`, a cubic-bezier, or `steps()` for a mechanical feel |
| `--motion-lift` | How far an interactive card rises on hover. `0px` = it doesn't |
| `--motion-press` | How far a button sinks when pressed. `0px` = it doesn't |
| `--motion-spin` | The busy indicator's animation shorthand |

### It reaches code we don't own

Three Tailwind theme variables are re-pointed at these tokens in `app/globals.css`:

```css
--default-transition-duration: var(--motion-fast);
--default-transition-timing-function: var(--motion-ease);
--animate-spin: var(--motion-spin);
```

That means a plain `transition` or `animate-spin` utility **inside an installed module** follows the style
automatically, without the module's author knowing styles exist. `@theme` emits into a cascade layer and
unlayered rules beat layered ones outright, so this wins without `!important`.

Consequence worth knowing: **`--motion-spin` must stay a usable `spin` animation.** Setting it to `none`
for a style that draws its own indicator would silently break every module's spinner. XP wants marching
blocks, so it sets `--motion-spin: spin 0.8s steps(8) infinite` (a *ticking* rotation, for modules) and
replaces `.spinner` separately.

### Two motion primitives

- **`.lift`** — an interactive card that responds to hover. Use it instead of
  `hover:-translate-y-0.5 hover:shadow-lg`, because whether a card floats is the style's decision.
- **`.spinner`** — the shared busy indicator. Anything showing "working…" should use it, modules included.
  A style may replace the whole *look*, not just the timing: XP's is a marching-blocks progress bar,
  Terminal's is a blinking block cursor.

### Reduced motion

`prefers-reduced-motion: reduce` zeroes `--motion-fast`, `--motion-slow` and `--motion-lift` globally,
which reaches every consumer including modules. The block sits at the end of `app/globals.css` because it
carries the same specificity as a style's own block and must therefore come later in source order.

**The spinner is deliberately left running**, just slowed. It isn't decoration — it's the only signal that
the server is still working, and a frozen ring reads as "crashed" rather than "calm".

**A style that replaces the busy indicator owns its reduced-motion behaviour**, because the global override
adjusts `--motion-spin`, which a replaced animation no longer reads. XP and Terminal each slow their own
keyframes in `app/styles.css`.

---

## 7. Adding a style — the checklist

1. Add an entry to `STYLES` in `lib/styles.ts`: id, display name, `family` (which heading it appears under
   in the picker), a one-line description, a `swatch` describing its structure, and at least one palette.
2. Add the id to the `branding.style` setting's allowed values in `lib/settings.ts`.
3. Add a `:root[data-style="<id>"] { … }` block in `app/styles.css` defining **every** token in §2.
4. If the style needs decorative flourishes (bevels, gloss, glass), add them **to the shared primitives
   only**, scoped by the same attribute: `:root[data-style="<id>"] .btn { … }`. Drive any colour in them
   through style-private tokens, or you'll block palettes later.
5. **Set the motion tokens (§6).** Timing is not optional polish — a style that skips this inherits
   Modern's easing and will feel wrong no matter how correct its corners are.
6. Check it against §3 and §4. Actually check the contrast — don't estimate it.
7. Look at it with **a module installed**, not just core screens. That's the case the rules exist for.
8. Look at it at **375px wide**, and in both light and dark if it's adaptive.
9. Screenshot it for the changelog entry.

## 8. Adding a palette — the shorter checklist

1. Add it to that style's `palettes` array in `lib/styles.ts`, with swatch colours that **match what the
   CSS actually sets**. The picker previews from this data; a mismatch is a lie in the UI.
2. Add a `:root[data-style="<style>"][data-palette="<id>"] { … }` block overriding **only** colour tokens.
3. Re-check §4 for the new hues, including the focus ring and `--danger`, which are easy to forget because
   they rarely appear in a screenshot.
4. If the parent style is adaptive and this palette is committed, handle both system settings (§5).
5. Screenshot it.

**Never reorder a style's `palettes` array casually** — the first entry is the fallback for anyone whose
stored palette no longer resolves, so reordering silently restyles instances.

**Promoting a palette to a style?** Do the add-a-style checklist above, remove it from the old style's
`palettes`, and **add a `MOVED` entry** (§10) so anyone using it is carried across instead of dropped on
the old style's default.

---

## 9. Style-specific settings

A style may expose its own options. **Modern** offers a free accent colour; the others offer none, because
their palettes cover the same ground more safely.

Declare them in `STYLE_SETTINGS` (`lib/settings.ts`), keyed by style id:

```ts
export const STYLE_SETTINGS: Record<string, SettingKey[]> = {
  default: ["branding.accent"],
  crystal: [],
  aero: [],
  xp: [],
  terminal: [],
  brutalist: [],
  paper: [],
};
```

The Appearance section then shows exactly those under the chosen style, and an empty list renders an
honest "this style has no options of its own".

**A setting listed here must also be honoured at runtime.** `BrandingStyle` checks this registry before
emitting the accent override — otherwise the UI would offer a control that the CSS ignores, which is the
bug this mechanism exists to prevent. If you add a style setting, wire both ends.

**Prefer a palette to a setting.** A palette is reviewed, contrast-checked and guaranteed to look
deliberate; a free colour control is none of those. Modern keeps its accent because a soft neutral shell
genuinely tolerates any hue. Nothing else does.

---

## 10. What is stored, and what happens when it doesn't resolve

Two settings: `branding.style` and `branding.palette`, written together and read back through
**`resolveStylePair(styleId, paletteId)`** — the single choke point. It does two things in order:

1. **Applies any move** (see below), which can change the *style*, not just the palette.
2. **Normalises the palette** via `resolvePalette`, which returns the requested palette if it belongs to
   that style and the style's first palette otherwise.

It runs in three places, deliberately:

- **On save**, so an invalid pairing is never stored.
- **On render** (`app/layout.tsx` via `styleId()` / `paletteId()`), so a pairing that became invalid still
  produces a coherent page rather than an attribute matching no CSS at all.
- **In the picker**, so the settings page shows what is actually rendering, not a stale stored value.

### Broken vs moved — they need different answers

An update that removes a palette degrades to the style's default; one that removes a *style* degrades to
Modern. That is right for something genuinely gone.

**It is wrong for something that simply lives somewhere else now.** When Aero was promoted out of Crystal,
plain fallback would have dropped everyone on it onto Crystal · Aurora — a look they never chose — while
their stored setting plainly said "Aero". So renames and promotions go in the `MOVED` map in
`lib/styles.ts`:

```ts
const MOVED: Record<string, { style: string; palette: string }> = {
  "crystal:aero": { style: "aero", palette: "sky" },
  "default:paper": { style: "paper", palette: "newsprint" },
};
```

**Keep entries forever.** They cost nothing, and an instance can update from any age — someone on a
two-year-old build still deserves to land where they meant to be. Add one whenever you promote a palette
to a style, rename an id, or fold a style into another. `tests/unit/styles.test.ts` asserts every move
lands on a pairing that actually exists.

---

## 11. Why not a theme file or a plugin?

Considered and rejected for now:

- **Styles as uploadable files** — that's arbitrary CSS from outside, which is a code-execution-adjacent
  surface on a security-first app. Styles ship with JonDash and are reviewed like any other code.
- **Styles as modules** — modules are sandboxed to their own pages by design; a style is deliberately
  global. Making styles a module capability would hand any installed module control of the whole UI.

If either is revisited, it needs its own security review, not an extension of this document.
