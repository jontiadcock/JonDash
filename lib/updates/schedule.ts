import "server-only";
import { getUpdateScheduleSettings } from "@/lib/settings";

/**
 * When automatic updates are allowed to run (BUG-30).
 *
 * Applying an update means a rebuild and a restart, which signs everyone out. So this is
 * never "as soon as one appears" — the admin picks a window, and the runner only acts
 * inside it. Nothing happens at all unless a module or helper is individually opted in.
 *
 * Deliberately compared in LOCAL time, not UTC: an admin who picks 03:00 means 03:00 where
 * they are, and a schedule that drifts by the timezone offset would fire in the middle of
 * their working day.
 */

export type UpdateFrequency = "daily" | "weekly" | "monthly";

export type UpdateSchedule = {
  frequency: UpdateFrequency;
  hour: number;
  minute: number;
  dayOfWeek: number; // 0 = Sunday
  dayOfMonth: number; // 1-28
};

export async function readUpdateSchedule(): Promise<UpdateSchedule> {
  const { frequency, timeOfDay, dayOfWeek, dayOfMonth } = await getUpdateScheduleSettings();

  // The stored value is validated on save, but a hand-edited database shouldn't be able to
  // make the scheduler throw on every tick — fall back rather than fail.
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(timeOfDay));
  return {
    frequency: (["daily", "weekly", "monthly"] as const).includes(frequency as UpdateFrequency)
      ? (frequency as UpdateFrequency)
      : "weekly",
    hour: m ? Number(m[1]) : 3,
    minute: m ? Number(m[2]) : 0,
    dayOfWeek: Number(dayOfWeek) >= 0 && Number(dayOfWeek) <= 6 ? Number(dayOfWeek) : 0,
    dayOfMonth: Number(dayOfMonth) >= 1 && Number(dayOfMonth) <= 28 ? Number(dayOfMonth) : 1,
  };
}

/** The moment a given schedule is next due, at or after `from`. */
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

  // Monthly: the chosen date this month if it hasn't passed, otherwise next month.
  if (at.getDate() > s.dayOfMonth) {
    // setDate(1) FIRST. setMonth() overflows when the current day doesn't exist in the
    // target month — from Jan 30, setMonth(Jan+1) gives "Feb 30", which JS rolls forward
    // to March 2, silently skipping February entirely.
    at.setDate(1);
    at.setMonth(at.getMonth() + 1);
  }
  at.setDate(s.dayOfMonth);
  return at;
}

/**
 * Is a run due now?
 *
 * `lastRun` is what stops a missed window being skipped forever: the check is "the due
 * moment has passed and we haven't run since", not "it is exactly 03:00". A machine that
 * was asleep at 03:00 still updates when it wakes, which is the whole point of a schedule
 * on a self-hosted box that isn't on around the clock.
 */
export function isRunDue(s: UpdateSchedule, lastRun: Date | null, now: Date): boolean {
  // No baseline yet is NEVER due. The caller records "now" the first time it looks, so the
  // first real run lands at the next window. Deriving a synthetic first window instead
  // means a freshly configured install can rebuild and restart itself minutes later —
  // during setup, from the user's point of view for no reason at all.
  if (!lastRun) return false;
  return now >= nextRunAfter(s, lastRun);
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Plain-English summary for the admin page. */
export function describeSchedule(s: UpdateSchedule): string {
  const time = `${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`;
  if (s.frequency === "daily") return `Every day at ${time}`;
  if (s.frequency === "weekly") return `Every ${DAYS[s.dayOfWeek]} at ${time}`;
  const n = s.dayOfMonth;
  const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `On the ${n}${suffix} of each month at ${time}`;
}
