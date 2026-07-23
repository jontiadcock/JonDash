import { describe, it, expect } from "vitest";
import { nextRunAfter, isRunDue, describeSchedule, type UpdateSchedule } from "@/lib/updates/schedule";

/**
 * Scheduling for automatic updates (BUG-30).
 *
 * The failure modes here are quiet ones: a schedule that never fires looks exactly like
 * "there was nothing to update", which is the trap MOD-10 already fell into once.
 */

const base: UpdateSchedule = { frequency: "daily", hour: 3, minute: 0, dayOfWeek: 0, dayOfMonth: 1 };
const at = (s: string) => new Date(s);

describe("nextRunAfter", () => {
  it("daily: later today if the time hasn't passed, else tomorrow", () => {
    expect(nextRunAfter(base, at("2026-07-23T01:00:00")).toISOString())
      .toBe(at("2026-07-23T03:00:00").toISOString());
    expect(nextRunAfter(base, at("2026-07-23T04:00:00")).toISOString())
      .toBe(at("2026-07-24T03:00:00").toISOString());
  });

  it("weekly: lands on the chosen weekday", () => {
    // 2026-07-23 is a Thursday. Asking for Sunday (0) must reach Sunday the 26th.
    const s = { ...base, frequency: "weekly" as const, dayOfWeek: 0 };
    const next = nextRunAfter(s, at("2026-07-23T09:00:00"));
    expect(next.getDay()).toBe(0);
    expect(next.getDate()).toBe(26);
    expect(next.getHours()).toBe(3);
  });

  it("weekly: a full week later when today IS the day but the time has passed", () => {
    const s = { ...base, frequency: "weekly" as const, dayOfWeek: 4 }; // Thursday
    const next = nextRunAfter(s, at("2026-07-23T09:00:00")); // Thursday, past 03:00
    expect(next.getDay()).toBe(4);
    expect(next.getDate()).toBe(30); // the following Thursday, not today
  });

  it("monthly: this month if the date is still ahead, next month once it's passed", () => {
    const s = { ...base, frequency: "monthly" as const, dayOfMonth: 28 };
    expect(nextRunAfter(s, at("2026-07-10T09:00:00")).getMonth()).toBe(6); // July
    expect(nextRunAfter(s, at("2026-07-28T09:00:00")).getMonth()).toBe(7); // August
    expect(nextRunAfter(s, at("2026-07-28T09:00:00")).getDate()).toBe(28);
  });

  it("monthly: never skips February", () => {
    // Why dayOfMonth is capped at 28 — a 30th would silently do nothing in February,
    // and a schedule that quietly skips a month is worse than one that runs early.
    const s = { ...base, frequency: "monthly" as const, dayOfMonth: 28 };
    const next = nextRunAfter(s, at("2026-01-29T09:00:00"));
    expect(next.getMonth()).toBe(1); // February
    expect(next.getDate()).toBe(28);
  });
});

describe("isRunDue", () => {
  it("is NEVER due without a baseline — a fresh install must not restart itself", () => {
    // The scheduler records "now" the first time it looks, so the first real run lands at
    // the next window. Deriving a synthetic first window instead means a box configured at
    // 09:00 with a 03:00 schedule rebuilds and restarts minutes later, mid-setup.
    expect(isRunDue(base, null, at("2026-07-23T03:00:01"))).toBe(false);
    expect(isRunDue(base, null, at("2026-07-23T09:00:00"))).toBe(false);
    expect(isRunDue({ ...base, frequency: "monthly" }, null, at("2030-01-01T00:00:00"))).toBe(false);
  });

  it("fires once the window passes, then not again until the next one", () => {
    const lastRun = at("2026-07-23T03:00:00");
    expect(isRunDue(base, lastRun, at("2026-07-23T12:00:00"))).toBe(false);
    expect(isRunDue(base, lastRun, at("2026-07-24T02:59:00"))).toBe(false);
    expect(isRunDue(base, lastRun, at("2026-07-24T03:00:00"))).toBe(true);
  });

  it("catches up after the machine was off — the whole point of a schedule", () => {
    // Asleep at 03:00 and switched on at 09:00 must still update, rather than waiting
    // another full period because the exact minute was missed.
    const lastRun = at("2026-07-20T03:00:00");
    expect(isRunDue(base, lastRun, at("2026-07-23T09:00:00"))).toBe(true);

    const weekly = { ...base, frequency: "weekly" as const, dayOfWeek: 0 };
    expect(isRunDue(weekly, at("2026-07-05T03:00:00"), at("2026-07-23T09:00:00"))).toBe(true);
  });

  it("weekly does not fire daily", () => {
    // The regression that would make "weekly" mean "every day": comparing only the time.
    const weekly = { ...base, frequency: "weekly" as const, dayOfWeek: 0 };
    const lastRun = at("2026-07-19T03:00:00"); // a Sunday
    expect(isRunDue(weekly, lastRun, at("2026-07-20T03:00:01"))).toBe(false);
    expect(isRunDue(weekly, lastRun, at("2026-07-22T03:00:01"))).toBe(false);
    expect(isRunDue(weekly, lastRun, at("2026-07-26T03:00:01"))).toBe(true);
  });
});

describe("describeSchedule", () => {
  it("says it in plain English, with the right ordinal", () => {
    expect(describeSchedule(base)).toBe("Every day at 03:00");
    expect(describeSchedule({ ...base, frequency: "weekly", dayOfWeek: 1, hour: 14, minute: 30 }))
      .toBe("Every Monday at 14:30");
    expect(describeSchedule({ ...base, frequency: "monthly", dayOfMonth: 1 })).toContain("1st");
    expect(describeSchedule({ ...base, frequency: "monthly", dayOfMonth: 2 })).toContain("2nd");
    expect(describeSchedule({ ...base, frequency: "monthly", dayOfMonth: 3 })).toContain("3rd");
    expect(describeSchedule({ ...base, frequency: "monthly", dayOfMonth: 11 })).toContain("11th");
    expect(describeSchedule({ ...base, frequency: "monthly", dayOfMonth: 12 })).toContain("12th");
    expect(describeSchedule({ ...base, frequency: "monthly", dayOfMonth: 21 })).toContain("21st");
  });
});
