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

  /**
   * **BUG-74.** This first shipped storing the dismissal in `localStorage`, which is scoped per
   * browser *and per origin* — so "No thanks" at `192.168.1.50:3000` on a phone was invisible at
   * `localhost:3000` on a desktop, and the owner met the banner again. CORE-05's wording was "once
   * dismissed it stays dismissed — **per user**", which is a promise about a person and can only be
   * kept server-side.
   */
  it("remembers the dismissal against the person, not the browser", () => {
    expect(src, "the banner is storing its own dismissal client-side again").not.toMatch(
      /localStorage|sessionStorage/,
    );
    expect(src).toMatch(/dismissSupportBannerAction/);
    // Read on the server and passed in, so a dismissed banner never flashes before being hidden.
    expect(src, "the server-provided flag no longer suppresses the banner").toMatch(
      /if \(dismissed\b/,
    );
  });

  it("keeps the read out of the server-actions module", () => {
    // Every export from a "use server" file is a callable endpoint, so a `hasDismissed(userId)`
    // helper there would be a route anyone could call with anyone's id.
    const actions = strip(read("app", "components", "support-actions.ts"));
    expect(actions).toMatch(/dismissSupportBannerAction/);
    expect(actions, "a read helper is exported from a server-actions file").not.toMatch(
      /export async function (get|has)/,
    );
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
