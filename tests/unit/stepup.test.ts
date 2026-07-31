import { describe, it, expect, beforeEach, vi } from "vitest";

/*
 * `lib/auth/stepup.ts` had NO test at all, and it guards restoring a backup — the most destructive
 * action in the product (CORE-18 findings, A2). Three properties were unenforced:
 *
 *  1. the 30-minute window, so a session that verified TOTP long ago is not still trusted;
 *  2. the phrase being OPTIONAL, which the 1.8.0 restore rework relies on — a regression that
 *     reinstated a required phrase would silently break the restore form;
 *  3. that omitting the phrase still cannot get past the authenticator.
 *
 * Mocked at the module boundary rather than run against a database: what is being asserted is the
 * DECISION this file makes, and giving it a real session would test `lib/auth/session.ts` instead.
 */
const { state } = vi.hoisted(() => ({
  state: {
    session: null as { totpVerifiedAt: Date | null } | null,
    user: null as { id: string; totpSecretEnc: string | null } | null,
    totpAccepts: false,
    marked: false,
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: async () => state.session,
  markCurrentSessionTotpVerified: async () => {
    state.marked = true;
  },
}));
vi.mock("@/lib/auth/guards", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/auth/totp", () => ({ consumeTotpForUser: async () => state.totpAccepts }));

import { verifyStepUp, hasRecentTotp, STEP_UP_WINDOW_MS } from "@/lib/auth/stepup";

/** REFS lib/auth/stepup.ts · app/admin/backup/actions.ts — the caller this protects */

const ENROLLED = { id: "u1", totpSecretEnc: "enc" };

beforeEach(() => {
  state.session = null;
  state.user = ENROLLED;
  state.totpAccepts = false;
  state.marked = false;
});

describe("hasRecentTotp: the window is what makes step-up mean anything", () => {
  it("is false with no session", async () => {
    expect(await hasRecentTotp()).toBe(false);
  });

  it("is false when the session never verified TOTP", async () => {
    state.session = { totpVerifiedAt: null };
    expect(await hasRecentTotp()).toBe(false);
  });

  it("is true just inside the window", async () => {
    state.session = { totpVerifiedAt: new Date(Date.now() - (STEP_UP_WINDOW_MS - 60_000)) };
    expect(await hasRecentTotp()).toBe(true);
  });

  it("is false just outside it — an old verification is not a current one", async () => {
    state.session = { totpVerifiedAt: new Date(Date.now() - (STEP_UP_WINDOW_MS + 60_000)) };
    expect(await hasRecentTotp()).toBe(false);
  });
});

describe("verifyStepUp: the authenticator is the gate, not the phrase", () => {
  it("passes with NO phrase when TOTP is recent — the 1.8.0 restore form depends on this", async () => {
    state.session = { totpVerifiedAt: new Date() };
    expect(await verifyStepUp({})).toEqual({ ok: true });
  });

  it("refuses when the typed phrase does not match the required one", async () => {
    state.session = { totpVerifiedAt: new Date() };
    const res = await verifyStepUp({ phrase: "Everything", typed: "everything" });
    expect(res.ok).toBe(false);
  });

  it("accepts the phrase when it matches exactly", async () => {
    state.session = { totpVerifiedAt: new Date() };
    expect(await verifyStepUp({ phrase: "Everything", typed: "Everything" })).toEqual({ ok: true });
  });

  it("⚠ omitting the phrase does NOT get past the authenticator", async () => {
    state.session = { totpVerifiedAt: new Date(Date.now() - (STEP_UP_WINDOW_MS + 1000)) };
    const res = await verifyStepUp({});
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/6-digit code/i);
  });

  it("refuses an account with no authenticator enrolled", async () => {
    state.user = { id: "u1", totpSecretEnc: null };
    const res = await verifyStepUp({ totpCode: "123456" });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/two-factor/i);
  });

  it("refuses a malformed code without ever consulting the authenticator", async () => {
    state.totpAccepts = true; // would pass if it were reached
    const res = await verifyStepUp({ totpCode: "12345" });
    expect(res.ok).toBe(false);
    expect(state.marked).toBe(false);
  });

  it("refuses a wrong code", async () => {
    state.totpAccepts = false;
    const res = await verifyStepUp({ totpCode: "123456" });
    expect(res.ok).toBe(false);
    expect(state.marked).toBe(false);
  });

  it("accepts a correct code and starts the window, so the next action need not re-enter", async () => {
    state.totpAccepts = true;
    expect(await verifyStepUp({ totpCode: "123456" })).toEqual({ ok: true });
    expect(state.marked).toBe(true);
  });
});
