import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

/*
 * `app/login/actions.ts` had NO test coverage at all (CORE-18 findings, A1) — nothing in `tests/`
 * referenced `loginPasswordAction` or `lockedUntil`. Three security properties were unenforced:
 *
 *  1. the lockout after MAX_FAILED attempts, and that it actually refuses while locked;
 *  2. ⚠ the GENERIC MESSAGE on every failure path. An unknown address, a wrong password, a locked
 *     account, a disabled account and a service account must be indistinguishable — a refactor that
 *     returns early on any one of them restores the account-enumeration oracle, and nothing would
 *     have caught it;
 *  3. ⚠ that a service account is refused BEFORE any credential comparison (SEC-07), so its
 *     existence cannot be discovered by watching this endpoint.
 *
 * `next/headers` and `next/navigation` are mocked because a server action cannot otherwise run
 * outside a request; everything else is the real code against the real test database.
 */
const { store, jar } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  jar: new Map<string, string>(),
}));

/*
 * ⚠ `cookies()` as well as `headers()`. The SUCCESS path writes the short-lived pre-auth cookie, so
 * mocking only `headers` makes every passing-credential test fail on the mock rather than on the
 * behaviour — which reads exactly like a broken login.
 */
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => store.get(k.toLowerCase()) ?? null }),
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined),
    set: (k: string, v: string) => void jar.set(k, v),
    delete: (k: string) => void jar.delete(k),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    // The action redirects on success. Throwing is what Next itself does, and it lets a test
    // distinguish "reached the redirect" from "returned an error" without a real router.
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${to}` });
  },
}));

import { prisma } from "@/lib/db";
import { loginPasswordAction } from "@/app/login/actions";
import { hashPassword } from "@/lib/auth/password";
import { encryptTotpSecret, generateTotpSecret } from "@/lib/auth/totp";
import { resetDb } from "../helpers";

/** REFS app/login/actions.ts · lib/auth/password.ts › verifyDecoyPassword() */

const GENERIC = "Invalid email or password.";
const PASSWORD = "correct-horse-battery-9";

/** Same origin, so `assertSameOrigin` passes and the test exercises the login logic itself. */
function sameOrigin() {
  store.clear();
  jar.clear();
  store.set("host", "dash.test");
  store.set("origin", "https://dash.test");
  // A distinct IP per test, so the per-IP rate limit of one test cannot fail the next.
  store.set("x-forwarded-for", `10.0.0.${Math.floor(Math.random() * 250) + 1}`);
}

function form(email: string, password: string) {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", password);
  return fd;
}

async function makeUser(over: Record<string, unknown> = {}) {
  return prisma.user.create({
    data: {
      email: "person@t.local",
      role: "USER",
      status: "ACTIVE",
      passwordHash: await hashPassword(PASSWORD),
      mfaEnabled: true,
      totpSecretEnc: encryptTotpSecret(generateTotpSecret()),
      ...over,
    },
  });
}

beforeEach(async () => {
  await resetDb();
  sameOrigin();
});
afterAll(() => prisma.$disconnect());

describe("login: every failure answers the same way", () => {
  it("an unknown address gets the generic message", async () => {
    expect(await loginPasswordAction({}, form("nobody@t.local", PASSWORD))).toEqual({ error: GENERIC });
  });

  it("a wrong password gets the SAME message as an unknown address", async () => {
    await makeUser();
    expect(await loginPasswordAction({}, form("person@t.local", "wrong-password-xx"))).toEqual({
      error: GENERIC,
    });
  });

  it("a disabled account gets the same message", async () => {
    await makeUser({ status: "DISABLED" });
    expect(await loginPasswordAction({}, form("person@t.local", PASSWORD))).toEqual({ error: GENERIC });
  });

  it("⚠ a service account gets the same message, so its existence is not discoverable", async () => {
    await makeUser({
      email: "agent@t.local",
      isServiceAccount: true,
      passwordHash: null,
      mfaEnabled: false,
      totpSecretEnc: null,
    });
    expect(await loginPasswordAction({}, form("agent@t.local", PASSWORD))).toEqual({ error: GENERIC });
  });

  it("a correct password reaches the second factor rather than returning an error", async () => {
    await makeUser();
    await expect(loginPasswordAction({}, form("person@t.local", PASSWORD))).rejects.toThrow(
      /NEXT_REDIRECT/,
    );
  });
});

describe("login: the lockout", () => {
  it("counts failures and locks the account on the fifth", async () => {
    const user = await makeUser();
    for (let i = 0; i < 4; i++) {
      sameOrigin();
      await loginPasswordAction({}, form("person@t.local", "wrong-password-xx"));
    }
    let row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.failedLoginCount).toBe(4);
    expect(row.lockedUntil).toBeNull();

    sameOrigin();
    await loginPasswordAction({}, form("person@t.local", "wrong-password-xx"));
    row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.failedLoginCount).toBe(5);
    expect(row.lockedUntil).not.toBeNull();
    expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("⚠ refuses the CORRECT password while locked, with the generic message", async () => {
    await makeUser({ failedLoginCount: 5, lockedUntil: new Date(Date.now() + 60_000) });
    expect(await loginPasswordAction({}, form("person@t.local", PASSWORD))).toEqual({ error: GENERIC });
  });

  it("lets the correct password through once the lock has expired", async () => {
    await makeUser({ failedLoginCount: 5, lockedUntil: new Date(Date.now() - 1000) });
    await expect(loginPasswordAction({}, form("person@t.local", PASSWORD))).rejects.toThrow(
      /NEXT_REDIRECT/,
    );
  });

  it("a successful sign-in clears the failure count", async () => {
    const user = await makeUser({ failedLoginCount: 3 });
    await expect(loginPasswordAction({}, form("person@t.local", PASSWORD))).rejects.toThrow(
      /NEXT_REDIRECT/,
    );
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.failedLoginCount).toBe(0);
    expect(row.lockedUntil).toBeNull();
  });
});

describe("login: an enrolment gap fails closed", () => {
  it("refuses a correct password when MFA was never completed", async () => {
    await makeUser({ mfaEnabled: false, totpSecretEnc: null });
    const res = await loginPasswordAction({}, form("person@t.local", PASSWORD));
    expect(res.error).toMatch(/setup incomplete/i);
  });
});
