import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderBrandedEmail, textToHtml, readableOn } from "@/lib/email/template";
import { STYLES } from "@/lib/styles";

/**
 * The branded email shell (1.8.0, design C2).
 *
 * The properties worth pinning are the ones a rendering test in a browser would never catch,
 * because mail clients are not browsers: escaping, the paragraph rule, contrast on the accent,
 * and — most importantly — that the palette colours this template resolves are the same ones the
 * app actually paints with.
 * REFS app/styles.css · app/globals.css — read as text
 */

const base = {
  appName: "JonDash",
  accent: "#4f46e5",
  title: "Test email",
  text: "First paragraph.\n\nSecond paragraph.",
};

describe("a module cannot inject markup into a JonDash email", () => {
  it("escapes the body", () => {
    const { html } = renderBrandedEmail({ ...base, text: `<script>alert(1)</script>` });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes list labels and values", () => {
    const { html } = renderBrandedEmail({
      ...base,
      lists: [{ heading: "H&M", rows: [{ label: `<b>x</b>`, value: `a"b` }] }],
    });
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("H&amp;M");
  });

  it("escapes the CTA, which is a URL a module supplies", () => {
    const { html } = renderBrandedEmail({
      ...base,
      cta: { label: `Open"`, url: `https://x/?a=1&b=2` },
    });
    expect(html).toContain("&amp;b=2");
    expect(html).toContain("&quot;");
  });

  it("escapes the app name — it is admin-supplied text", () => {
    const { html } = renderBrandedEmail({ ...base, appName: `<img src=x>` });
    expect(html).not.toContain("<img src=x>");
  });
});

describe("plain text becomes readable HTML", () => {
  it("makes a paragraph per blank-line-separated block", () => {
    const html = textToHtml("one\n\ntwo");
    expect(html.match(/<p /g) ?? []).toHaveLength(2);
  });

  it("makes a single newline a line break, not a paragraph", () => {
    const html = textToHtml("one\ntwo");
    expect(html.match(/<p /g) ?? []).toHaveLength(1);
    expect(html).toContain("<br>");
  });

  it("does not use white-space: pre-wrap", () => {
    // Outlook's Word-based renderer handles it unreliably, and Outlook is the client most
    // likely to be reading a server alert.
    const { html } = renderBrandedEmail(base);
    expect(html).not.toMatch(/pre-wrap/);
  });
});

describe("the call to action stays readable on any palette", () => {
  it("puts white text on a dark accent and black on a light one", () => {
    expect(readableOn("#000000")).toBe("#ffffff");
    expect(readableOn("#ffffff")).toBe("#000000");
    expect(readableOn("#f5e600")).toBe("#000000"); // Brutalist Yellow
    expect(readableOn("#4f46e5")).toBe("#ffffff"); // Modern Indigo
  });

  it("falls back rather than throwing on a malformed accent", () => {
    // A bad stored value must never stop an email being sent.
    expect(() => renderBrandedEmail({ ...base, accent: "not-a-colour" })).not.toThrow();
    expect(readableOn("nonsense")).toBe("#ffffff");
  });
});

describe("every message carries a real plain-text alternative", () => {
  it("builds the text from the same inputs, not by stripping the HTML", () => {
    const { text } = renderBrandedEmail({
      ...base,
      lists: [{ heading: "Jobs", rows: [{ label: "Photos", value: "14 runs", state: "ok" }] }],
      cta: { label: "Open", url: "https://example.test/x" },
    });
    expect(text).toContain("Test email");
    expect(text).toContain("Photos: 14 runs");
    expect(text).toContain("https://example.test/x");
    expect(text).not.toContain("<");
  });
});

/**
 * The drift guard, and the reason this file reads `styles.css`.
 *
 * `lib/styles.ts` calls its palette colours a MIRROR of what `app/styles.css` actually sets. A
 * mirror with nothing checking it is a second source of truth waiting to disagree — and the
 * consequence here is specific: emails would go out in a colour the app itself stopped using,
 * which nobody would connect back to a palette edit months earlier.
 */
describe("palette colours match the CSS they mirror", () => {
  const CSS = fs.readFileSync(path.join(process.cwd(), "app", "styles.css"), "utf8").toLowerCase();
  const GLOBALS = fs.readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8").toLowerCase();

  for (const style of STYLES) {
    for (const palette of style.palettes) {
      it(`${style.id} · ${palette.id} — accent ${palette.accent} appears in the stylesheets`, () => {
        const hex = palette.accent.toLowerCase();
        expect(
          CSS.includes(hex) || GLOBALS.includes(hex),
          `${style.id}/${palette.id}: accent ${palette.accent} is in lib/styles.ts but nowhere in the CSS — one of them has drifted, and email now uses this value`,
        ).toBe(true);
      });
    }
  }
});
