import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The session cookie's `SameSite` setting, and the check that has to hold it up (BUG-73).
 *
 * **Source-level on purpose.** Both facts below are one-word edits that look like hardening and are
 * not: setting the session cookie back to `strict` reintroduces a daily bug for phone users and
 * breaks the installable web app (CORE-15), while loosening `assertSameOrigin` to allow a request
 * with no Origin and no Referer would remove the control that replaced it. Neither would fail any
 * behavioural test — the app works fine in a browser either way.
 * REFS lib/auth/session.ts · lib/security/csrf.ts — read as text
 */
const read = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), "utf8");
/**
 * A regex over source is a regex over comments too (BUG-39) — and these files explain themselves.
 */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the session cookie", () => {
  const src = strip(read("lib", "auth", "session.ts"));

  it("is SameSite=Lax, so a bookmark or home-screen launch keeps you signed in", () => {
    expect(src, "the session cookie is back to strict — see BUG-73 before changing this").toMatch(
      /sameSite:\s*"lax"/,
    );
  });

  it("is still httpOnly and path-scoped", () => {
    expect(src).toMatch(/httpOnly:\s*true/);
    expect(src).toMatch(/path:\s*"\/"/);
  });
});

/**
 * The short-lived flow cookies keep `strict`. Nothing ever arrives at them from outside — you are
 * already mid-flow on this site — so they pay nothing for the stricter setting, and a pre-auth
 * cookie is exactly the thing worth being strict about.
 */
describe("the short-lived flow cookies", () => {
  it.each([
    ["pre-auth (between password and TOTP)", ["lib", "auth", "preauth.ts"]],
    ["MFA re-enrolment", ["lib", "auth", "reenroll.ts"]],
    ["recovery-code reveal", ["lib", "auth", "recovery-reveal.ts"]],
  ])("keeps %s strict", (_label, file) => {
    expect(strip(read(...file))).toMatch(/sameSite:\s*"strict"/);
  });
});

describe("the same-origin check that now carries CSRF on its own", () => {
  const src = strip(read("lib", "security", "csrf.ts"));

  /**
   * With the cookie relaxed to `lax`, this is the control. It must refuse a request that carries
   * neither header rather than letting it through — the failure mode of a permissive fallback is
   * silent and total.
   */
  it("fails closed when there is no Origin and no Referer", () => {
    // The last statement of the function must be a throw, not a return.
    const fn = src.slice(src.indexOf("export async function assertSameOrigin"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toMatch(/throw new Error\("Cross-origin request rejected\."\);\s*$/);
  });

  it("compares against the forwarded host, so a proxy doesn't break it", () => {
    expect(src).toMatch(/x-forwarded-host/);
  });
});
