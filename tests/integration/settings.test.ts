import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  writeSetting,
  clearSettingsCache,
  getLoginMessage,
  getSessionLifetimeMs,
  getSessionLengthMs,
  getIdleTimeoutMs,
  getAuditRetentionDays,
  SESSION_ABSOLUTE_CAP_DAYS,
} from "@/lib/settings";
import { resetDb } from "../helpers";

beforeEach(async () => {
  await resetDb();
  clearSettingsCache();
});
afterAll(() => prisma.$disconnect());

describe("settings store", () => {
  it("returns sensible defaults when unset", async () => {
    expect(await getLoginMessage()).toBe("");
    // BUG-52: idle was 0 (disabled) until 1.6.1-beta.1. It ships on, and since 1.8.0 it IS
    // the single Session length.
    expect(await getSessionLengthMs()).toBe(120 * 60 * 1000);
    expect(await getAuditRetentionDays()).toBe(90);
  });

  it("persists valid values and reads them back typed", async () => {
    expect(await writeSetting("login.message", "Authorized users only.")).toBeNull();
    expect(await writeSetting("session.lengthMinutes", "15")).toBeNull();
    expect(await writeSetting("audit.retentionDays", "30")).toBeNull();

    expect(await getLoginMessage()).toBe("Authorized users only.");
    expect(await getSessionLengthMs()).toBe(15 * 60 * 1000);
    expect(await getAuditRetentionDays()).toBe(30);
  });

  it("rejects invalid values", async () => {
    // Session length has a floor — a few seconds would sign people out mid-task.
    expect(await writeSetting("session.lengthMinutes", "2")).not.toBeNull();
    // ...and a ceiling, so "effectively never" isn't a typo away.
    expect(await writeSetting("session.lengthMinutes", "999999")).not.toBeNull();
    // unknown key
    expect(await writeSetting("does.not.exist", "x")).toMatch(/unknown/i);
  });
});

/**
 * The 1.8.0 merge: "Session lifetime (days)" + "Idle timeout (minutes)" became one control.
 *
 * The property worth pinning is that merging TWO settings into ONE didn't quietly drop the
 * absolute cap — without it, a stolen token can be kept alive indefinitely because the idle
 * window keeps resetting on every use.
 */
describe("session length (1.8.0 merge)", () => {
  it("keeps an absolute ceiling that no setting can raise", async () => {
    const cap = SESSION_ABSOLUTE_CAP_DAYS * 24 * 60 * 60 * 1000;
    expect(await getSessionLifetimeMs()).toBe(cap);

    // Even at the longest length the control allows, the cap is unchanged.
    await writeSetting("session.lengthMinutes", "525600");
    expect(await getSessionLifetimeMs()).toBe(cap);
  });

  it("drives the idle check from the one setting", async () => {
    await writeSetting("session.lengthMinutes", "480");
    expect(await getIdleTimeoutMs()).toBe(480 * 60 * 1000);
    expect(await getIdleTimeoutMs()).toBe(await getSessionLengthMs());
  });

  it("ignores the legacy settings once the merged one is set", async () => {
    // An upgraded install still has both old rows; the migration derives from them ONCE and
    // they must not keep influencing anything afterwards.
    await writeSetting("session.lifetimeDays", "3");
    await writeSetting("session.idleTimeoutMinutes", "15");
    await writeSetting("session.lengthMinutes", "1440");

    expect(await getSessionLengthMs()).toBe(1440 * 60 * 1000);
    expect(await getIdleTimeoutMs()).toBe(1440 * 60 * 1000);
    expect(await getSessionLifetimeMs()).toBe(SESSION_ABSOLUTE_CAP_DAYS * 24 * 60 * 60 * 1000);
  });
});
