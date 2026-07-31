import "server-only";

/**
 * The branded email shell.
 *
 * ⚠ The app's own CSS is unavailable here: mail clients strip `<style>` and know nothing of CSS
 * custom properties, so every rule is an inlined literal and the palette is resolved to concrete
 * hex at send time. One template then covers every style × palette pairing.
 * ⚠ Light ground regardless of palette. Many clients override a dark background and leave the
 * light text on it, which is less readable than looking plain.
 * ⚠ Core owns the chrome and a module supplies only the body — so a module cannot ship mail that
 * renders badly in Outlook, nor mail that looks like it came from JonDash itself when it did not.
 *
 * REFS lib/email/send.ts · lib/modules/context.ts › sendMail — the two entry points
 *      lib/styles.ts › resolvePalette() — where the concrete hex comes from
 * PINS tests/unit/email-template.test.ts
 */

/** REFS STATE_COLOUR below — the fixed semantic colour for each */
export type RowState = "ok" | "warn" | "bad";

export type MailList = {
  heading: string;
  rows: { label: string; value: string; state?: RowState }[];
};

/** REFS lib/modules/types.ts › the sendMail capability — the module-facing shape of this */
export type BrandedEmail = {
  /** The instance's name — the wordmark, and what the footer signs off as. */
  appName: string;
  /** The palette's accent, already resolved to hex. */
  accent: string;
  /** Shown as the heading inside the message. Usually the same as the subject. */
  title: string;
  /**
   * The body, as PLAIN TEXT. ⚠ Callers must not hard-wrap — a wrapped line becomes a forced break
   * mid-sentence and the client then wraps again at its own width. REFS textToHtml() below
   */
  text: string;
  /** Optional single call to action. ⚠ `url` must already be absolute — resolving a path is the
   *  caller's job. REFS lib/app-url.ts › resolveAppUrl() */
  cta?: { label: string; url: string };
  /** Optional repeating blocks — label / value / state. Several are allowed. */
  lists?: MailList[];
  /** One quiet line at the bottom explaining why this arrived. */
  footer?: string;
};

/** ⚠ Fixed, never palette-derived — "this failed" must not change meaning with the theme, and
 *  these are picked to stay legible on the white sheet. */
const STATE_COLOUR: Record<RowState, string> = {
  ok: "#0f7a4d",
  warn: "#9a6100",
  bad: "#b3261e",
};

const INK = "#1c1c1e";
const MUTED = "#6b6b70";
const HAIRLINE = "#e6e6ea";
const SHEET = "#ffffff";
const PAGE = "#f2f2f5";

/** ⚠ Every caller-supplied string in this file goes through here. REFS textToHtml() below */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Plain text → HTML. ⚠ Escaped FIRST, always: without it a module could inject markup into a
 * branded JonDash email, which undoes the point of core owning the chrome. It also means a folder
 * path containing `<` or `&` renders as itself instead of vanishing.
 *
 * ⚠ Blank line → paragraph, newline → `<br>`; deliberately NOT `white-space: pre-wrap`, which
 * Outlook's Word-based renderer handles unreliably — and Outlook is the client most likely to be
 * reading a server alert. PINS tests/unit/email-template.test.ts
 */
export function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 14px;">${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Black or white, whichever is readable on `hex`. ⚠ A palette accent ranges from `#000000` to
 * near-white, so a CTA hardcoded to white text is invisible on half of them. Relative luminance per
 * WCAG. REFS app/components/branding.tsx › contrastOn() — the same rule for the app's own UI
 * PINS tests/unit/email-template.test.ts
 */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L =
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255);
  return L > 0.5 ? "#000000" : "#ffffff";
}

/** ⚠ Falls back rather than throwing — a malformed accent must never stop an email being sent. */
function safeAccent(accent: string): string {
  return /^#?[0-9a-f]{6}$/i.test(accent.trim())
    ? accent.trim().startsWith("#")
      ? accent.trim()
      : `#${accent.trim()}`
    : "#4f46e5";
}

function renderList(list: MailList): string {
  const rows = list.rows
    .map((r) => {
      const colour = r.state ? STATE_COLOUR[r.state] : INK;
      return `<tr>
  <td style="padding:7px 0;border-bottom:1px solid ${HAIRLINE};font-size:14px;color:${INK};word-break:break-word;">${escapeHtml(r.label)}</td>
  <td style="padding:7px 0 7px 12px;border-bottom:1px solid ${HAIRLINE};font-size:14px;color:${colour};text-align:right;white-space:nowrap;">${escapeHtml(r.value)}</td>
</tr>`;
    })
    .join("");

  return `<div style="margin:0 0 18px;">
  <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">${escapeHtml(list.heading)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;width:100%;">${rows}</table>
</div>`;
}

/** ⚠ The plain-text alternative is built from the same INPUTS, never stripped from the HTML. */
function renderText(o: BrandedEmail): string {
  const parts = [o.title, "", o.text.trim()];
  for (const list of o.lists ?? []) {
    parts.push("", list.heading.toUpperCase());
    for (const r of list.rows) parts.push(`  ${r.label}: ${r.value}`);
  }
  if (o.cta) parts.push("", `${o.cta.label}: ${o.cta.url}`);
  if (o.footer) parts.push("", "—", o.footer);
  return parts.join("\n");
}

/**
 * The instance's own name and accent, resolved to literal values for a message.
 *
 * ⚠ Precedence: a custom accent set under Appearance beats the palette's, because that is what the
 * app itself paints with — mail using the palette colour would look like a different product to
 * its own dashboard. `STYLE_SETTINGS` decides whether the current style offers a custom accent at
 * all, so a stale value stored under a previous style is ignored rather than resurfacing here.
 *
 * REFS lib/settings.ts › STYLE_SETTINGS — the per-style list · lib/styles.ts › resolveStylePair()
 *      lib/email/send.ts · lib/modules/context.ts — the callers
 */
export async function currentBrand(): Promise<{ appName: string; accent: string }> {
  const { getAppName, getAccentColor, getStyleId, getPaletteId, STYLE_SETTINGS } = await import(
    "@/lib/settings"
  );
  const { resolveStylePair, resolvePalette } = await import("@/lib/styles");

  const [appName, custom, styleId, paletteId] = await Promise.all([
    getAppName(),
    getAccentColor(),
    getStyleId(),
    getPaletteId(),
  ]);

  const pair = resolveStylePair(styleId, paletteId);
  const palette = resolvePalette(pair.style, pair.palette);
  const styleOffersAccent = (STYLE_SETTINGS[pair.style] ?? []).includes("branding.accent");

  return {
    appName: appName || "JonDash",
    accent: styleOffersAccent && custom ? custom : palette.accent,
  };
}

/**
 * REFS lib/email/send.ts — the core send path · lib/modules/context.ts — the module capability
 *      lib/modules/types.ts — where that capability is declared
 * PINS tests/unit/email-template.test.ts
 */
export function renderBrandedEmail(o: BrandedEmail): { html: string; text: string } {
  const accent = safeAccent(o.accent);
  const onAccent = readableOn(accent);
  const lists = (o.lists ?? []).map(renderList).join("");

  const cta = o.cta
    ? `<div style="margin:22px 0 4px;">
  <a href="${escapeHtml(o.cta.url)}" style="display:inline-block;background:${accent};color:${onAccent};text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:4px;">${escapeHtml(o.cta.label)}</a>
</div>`
    : "";

  const footer = o.footer
    ? `<div style="border-top:1px solid ${HAIRLINE};padding:14px 26px;font-size:12px;color:${MUTED};">${escapeHtml(o.footer)}</div>`
    : "";

  // ⚠ Tables, inline styles, no shorthand Outlook mangles. Ugly by modern standards and correct
  // by mail-client ones — the one place in this codebase where that trade goes the other way.
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(o.title)}</title></head>
<body style="margin:0;padding:0;background:${PAGE};">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${PAGE};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:${SHEET};border-radius:6px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td style="height:3px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:22px 26px 0;">
  <div style="font-size:17px;font-weight:700;letter-spacing:-.02em;color:${INK};margin:0 0 14px;">${escapeHtml(o.appName)}</div>
  <h1 style="margin:0 0 12px;font-size:19px;font-weight:650;color:${INK};">${escapeHtml(o.title)}</h1>
  <div style="font-size:14px;line-height:1.55;color:${INK};">${textToHtml(o.text)}</div>
  ${lists}
  ${cta}
</td></tr>
<tr><td style="height:22px;font-size:0;line-height:0;">&nbsp;</td></tr>
${footer ? `<tr><td>${footer}</td></tr>` : ""}
</table>
</td></tr>
</table>
</body></html>`;

  return { html, text: renderText(o) };
}
