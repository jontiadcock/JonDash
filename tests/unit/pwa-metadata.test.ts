import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The metadata that makes JonDash installable rather than bookmarkable (CORE-15).
 *
 * **Source-level, because the failure is invisible in a browser.** Every one of these can be removed
 * and the app still works perfectly on a desktop — it just stops being installable on a phone, and
 * nobody finds out until someone tries Add to Home Screen and gets a Safari shortcut. Which is
 * exactly what happened: `appleWebApp.capable` alone produced *"just another link"* on the owner's
 * phone.
 */
const read = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the installable-web-app metadata", () => {
  const layout = strip(read("app", "layout.tsx"));

  /**
   * **The one that actually matters on an iPhone.** Next emits only the unprefixed
   * `mobile-web-app-capable` for `appleWebApp.capable` — deliberately, because the standard
   * deprecated the prefixed name — but iOS Safari reads only the prefixed one. Without it, Add to
   * Home Screen makes a shortcut that opens in Safari with the address bar.
   *
   * A future tidy-up removing a "deprecated" tag is the realistic way this breaks, which is why the
   * test says so rather than just asserting the string.
   */
  it("emits apple-mobile-web-app-capable, which iOS still requires", () => {
    expect(
      layout,
      "iOS reads only the apple- prefixed name; removing this turns the installed app back into a Safari bookmark",
    ).toMatch(/"apple-mobile-web-app-capable":\s*"yes"/);
  });

  it("keeps the standard capable declaration too", () => {
    // Via appleWebApp.capable, which is what Next turns into the unprefixed tag.
    expect(layout).toMatch(/appleWebApp:\s*\{[\s\S]*capable:\s*true/);
  });

  it("declares an Apple touch icon, which iOS uses instead of the manifest", () => {
    expect(layout).toMatch(/apple:\s*\[/);
  });

  it("points every icon at the branding route rather than a bundled file", () => {
    expect(layout).toMatch(/\/api\/branding\/icon/);
    // The stock create-next-app favicon is gone; a file here would silently win over the route.
    expect(fs.existsSync(path.join(process.cwd(), "app", "favicon.ico"))).toBe(false);
  });
});

describe("the web app manifest", () => {
  const src = strip(read("app", "manifest.ts"));

  it("declares what an install prompt requires", () => {
    expect(src).toMatch(/display:\s*"standalone"/);
    expect(src).toMatch(/start_url:/);
    // 192 and 512 are the sizes Chrome checks for before offering to install.
    expect(src).toMatch(/icon\(192\)/);
    expect(src).toMatch(/icon\(512\)/);
  });

  /**
   * Android crops a launcher icon to the device's shape and discards the outer fifth. A maskable
   * icon without padding is how a logo ends up beheaded — so the padded variants are declared, and
   * the icon route's `maskable` flag is what supplies the margin.
   */
  it("offers maskable variants for Android", () => {
    expect(src).toMatch(/icon\(192,\s*true\)/);
    expect(src).toMatch(/icon\(512,\s*true\)/);
    expect(src).toMatch(/maskable/);
  });
});
