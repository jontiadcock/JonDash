import "server-only";
import { getUpdateScheduleSettings } from "@/lib/settings";

/**
 * When automatic updates are allowed to run (BUG-30). Applying one means a rebuild and a restart,
 * so it is never "as soon as one appears" — the admin picks a window and the runner acts only
 * inside it, and only for items individually opted in.
 *
 * ⚠ Compared in LOCAL time, never UTC. An admin who picks 03:00 means 03:00 where they are; a
 * schedule drifting by the timezone offset fires in the middle of their working day.
 * REFS lib/updates/scheduler.ts — the tick · lib/updates/auto-run.ts — the master switch
 * PINS tests/unit/update-schedule.test.ts
 */

/** REFS lib/settings.ts › getUpdateScheduleSettings() — what is stored and validated */
export type UpdateFrequency = "daily" | "weekly" | "monthly";

/** REFS lib/settings.ts › getUpdateScheduleSettings() — the stored shape this normalises
 *  PINS tests/unit/update-schedule.test.ts */
export type UpdateSchedule = {
  /** The master switch. Nothing runs automatically while this is off. */
  autoEnabled: boolean;
  frequency: UpdateFrequency;
  hour: number;
  minute: number;
  dayOfWeek: number; // 0 = Sunday
  dayOfMonth: number; // 1-28
};

/** REFS app/admin/updates/page.tsx · lib/updates/auto-run.ts · lib/updates/scheduler.ts */
export async function readUpdateSchedule(): Promise<UpdateSchedule> {
  const { autoEnabled, frequency, timeOfDay, dayOfWeek, dayOfMonth } = await getUpdateScheduleSettings();

  // ⚠ Validated on save, but a hand-edited database must not make the scheduler throw on every
  // tick — fall back rather than fail.
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(timeOfDay));
  return {
    autoEnabled,
    frequency: (["daily", "weekly", "monthly"] as const).includes(frequency as UpdateFrequency)
      ? (frequency as UpdateFrequency)
      : "weekly",
    hour: m ? Number(m[1]) : 3,
    minute: m ? Number(m[2]) : 0,
    dayOfWeek: Number(dayOfWeek) >= 0 && Number(dayOfWeek) <= 6 ? Number(dayOfWeek) : 0,
    dayOfMonth: Number(dayOfMonth) >= 1 && Number(dayOfMonth) <= 28 ? Number(dayOfMonth) : 1,
  };
}

/** The moment a schedule is next due, at or after `from`.
 *  REFS isRunDue() below — the only caller  PINS tests/unit/update-schedule.test.ts */
export function nextRunAfter(s: UpdateSchedule, from: Date): Date {
  const at = new Date(from);
  at.setHours(s.hour, s.minute, 0, 0);
  if (at <= from) at.setDate(at.getDate() + 1);

  if (s.frequency === "daily") return at;

  if (s.frequency === "weekly") {
    // Days until the chosen weekday, 1-7 (never 0 — `at` is already tomorrow or later).
    const delta = (s.dayOfWeek - at.getDay() + 7) % 7;
    at.setDate(at.getDate() + delta);
    return at;
  }

  // Monthly: the chosen date this month if it has not passed, otherwise next month.
  if (at.getDate() > s.dayOfMonth) {
    // ⚠ `setDate(1)` FIRST — `setMonth()` overflows when the day does not exist in the target
    // month: Jan 30 + 1 month gives "Feb 30", which rolls to March 2 and skips February.
    at.setDate(1);
    at.setMonth(at.getMonth() + 1);
  }
  at.setDate(s.dayOfMonth);
  return at;
}

/**
 * Is a run due now? ⚠ The test is "the due moment has passed and we have not run since", never
 * "it is exactly 03:00" — a self-hosted box asleep at 03:00 must still update when it wakes.
 * REFS lib/updates/scheduler.ts — the only caller  PINS tests/unit/update-schedule.test.ts
 */
export function isRunDue(s: UpdateSchedule, lastRun: Date | null, now: Date): boolean {
  // ⚠ No baseline is NEVER due. The caller records "now" on first look, so the first real run
  // lands at the next window — a synthetic one would restart a freshly configured install.
  if (!lastRun) return false;
  return now >= nextRunAfter(s, lastRun);
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Plain-English summary for the admin page.
 *  REFS app/admin/updates/page.tsx  PINS tests/unit/update-schedule.test.ts */
export function describeSchedule(s: UpdateSchedule): string {
  const time = `${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`;
  if (s.frequency === "daily") return `Every day at ${time}`;
  if (s.frequency === "weekly") return `Every ${DAYS[s.dayOfWeek]} at ${time}`;
  const n = s.dayOfMonth;
  const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `On the ${n}${suffix} of each month at ${time}`;
}
