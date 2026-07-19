import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  writeSetting,
  clearSettingsCache,
  getLoginMessage,
  getSessionLifetimeMs,
  getIdleTimeoutMs,
  getAuditRetentionDays,
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
    expect(await getSessionLifetimeMs()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(await getIdleTimeoutMs()).toBe(0);
    expect(await getAuditRetentionDays()).toBe(90);
  });

  it("persists valid values and reads them back typed", async () => {
    expect(await writeSetting("login.message", "Authorized users only.")).toBeNull();
    expect(await writeSetting("session.lifetimeDays", "3")).toBeNull();
    expect(await writeSetting("session.idleTimeoutMinutes", "15")).toBeNull();
    expect(await writeSetting("audit.retentionDays", "30")).toBeNull();

    expect(await getLoginMessage()).toBe("Authorized users only.");
    expect(await getSessionLifetimeMs()).toBe(3 * 24 * 60 * 60 * 1000);
    expect(await getIdleTimeoutMs()).toBe(15 * 60 * 1000);
    expect(await getAuditRetentionDays()).toBe(30);
  });

  it("rejects invalid values", async () => {
    // idle timeout must be 0 or >= 5
    expect(await writeSetting("session.idleTimeoutMinutes", "2")).toMatch(/0 to disable|5 minutes/i);
    // lifetime out of range
    expect(await writeSetting("session.lifetimeDays", "0")).not.toBeNull();
    // unknown key
    expect(await writeSetting("does.not.exist", "x")).toMatch(/unknown/i);
  });
});
