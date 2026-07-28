import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * CORE-05 — the support page and the ask that must never become a nag.
 *
 * Source-level, and it has to be: both properties below are things a later edit would break
 * *silently*. A banner shown on day one still renders perfectly; a route spelled with four `e`s
 * still resolves. Neither produces a failure anyone would notice, and both are decisions the owner
 * made explicitly.
 */
const read = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), "utf8");
/**
 * A regex over source is a regex over COMMENTS too (BUG-39, and it caught this file on the first
 * run: the thank-you page's own comment explains why it does *not* call `requireUser`, which the
 * assertion for "doesn't call requireUser" duly matched).
 */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the support page", () => {
  /**
   * **Five `e`s. Locked by the owner and recorded in docs/ROADMAP.md.**
   *
   * They wrote `help-meeee` first, then said *"I want the address of the page that you enter to
   * specifically be help-meeeee"* — the emphasised spelling wins. It is one character and it is the
   * whole joke, which is exactly why a future tidy-up would "correct" it.
   */
  it("lives at /help-meeeee, with five e's", () => {
    expect(fs.existsSync(path.join(process.cwd(), "app", "(app)", "help-meeeee", "page.tsx"))).toBe(true);
    // Four e's, or six, would both resolve and both be wrong.
    expect(fs.existsSync(path.join(process.cwd(), "app", "(app)", "help-meeee"))).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), "app", "(app)", "help-meeeeee"))).toBe(false);
  });

  it("has a thank-you page that stores nothing and claims nothing", () => {
    const src = strip(read("app", "you-are-a-bloody-legend", "page.tsx"));
    // It cannot verify a payment — a self-hosted box behind a home router can't receive a webhook —
    // and pretending otherwise is the kind of theatre people notice.
    expect(src).not.toMatch(/prisma|requireUser|localStorage/);
  });

  it("is reachable from the settings navigation", () => {
    expect(read("app", "admin", "layout.tsx")).toMatch(/help-meeeee/);
  });
});

describe("the support banner never nags", () => {
  const src = strip(read("app", "components", "support.tsx"));

  /** Nobody is asked for money on day one — the owner's rule, and the whole point of the delay. */
  it("is hidden until the install is a week old", () => {
    expect(src).toMatch(/installedDays\s*<\s*7/);
  });

  it("stays dismissed once dismissed", () => {
    expect(src).toMatch(/localStorage\.setItem\(DISMISS_KEY/);
    // Storage unavailable must read as "already dismissed": of the two ways to be wrong, a banner
    // that can never be dismissed is much the worse one.
    expect(src).toMatch(/return true;/);
  });

  it("draws its heart from the theme rather than a fixed colour", () => {
    // "A JonDash-style love heart drawn from the user's own appearance tokens, so it takes their
    // palette" — so no literal pink, and no hex at all.
    expect(src).toMatch(/fill="currentColor"/);
    expect(src).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });

  it("gates nothing behind supporting", () => {
    // The licence is personal-use and free; this asks, it does not sell. A "supporter" check would
    // be the first step to something being withheld.
    expect(src).not.toMatch(/supporter|hasPaid|premium|unlock/i);
  });
});
