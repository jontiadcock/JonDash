import "server-only";
import fs from "node:fs";
import path from "node:path";
import { readUpdateSchedule, isRunDue } from "./schedule";
import { runAutoUpdates, auditAutoUpdateRun, anythingOptedIn } from "./auto-run";
import { requestRebuildAndRestart } from "@/lib/modules/rebuild";

/**
 * The thing that makes automatic updates actually happen (BUG-30).
 *
 * Started once at boot from `instrumentation.ts`, alongside the helper scheduler and for
 * the same reason: work that only runs when someone opens a page is not scheduled work.
 *
 * The last-run timestamp lives in `.data/`, not the database, because it must survive a
 * restore: restoring a backup taken before the last run would otherwise make the scheduler
 * think it is overdue and immediately rebuild and restart the machine you just restored.
 */

const DATA_DIR = path.join(process.cwd(), ".data");
const LAST_RUN_FILE = path.join(DATA_DIR, "auto-update-last-run");

// Checked every 15 minutes. The window is "has the due moment passed", not "is it exactly
// 03:00", so a coarse tick can't miss it — and a box that was asleep still updates when it
// wakes, which is the point of a schedule on a machine that isn't on around the clock.
const TICK_MS = 15 * 60 * 1000;

export function readLastRun(): Date | null {
  try {
    const raw = fs.readFileSync(LAST_RUN_FILE, "utf8").trim();
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function writeLastRun(when: Date): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(LAST_RUN_FILE, when.toISOString(), "utf8");
  } catch {
    // Best-effort. Failing to record it means a possible repeat, never a missed update.
  }
}

let started = false;

export function startUpdateScheduler(): void {
  if (started) return; // Next can call register() more than once in dev
  started = true;

  const tick = async () => {
    try {
      // Cheapest possible exit: no opt-ins means no network call, no manifest fetch.
      if (!(await anythingOptedIn())) return;

      const schedule = await readUpdateSchedule();
      const lastRun = readLastRun();
      if (!lastRun) {
        // First time we've looked: establish the baseline and wait for the next window,
        // rather than deciding a fresh install is already overdue and restarting it.
        writeLastRun(new Date());
        return;
      }
      if (!isRunDue(schedule, lastRun, new Date())) return;

      // Recorded BEFORE the work, not after. A crash mid-update must not leave the
      // scheduler retrying a rebuild every 15 minutes.
      writeLastRun(new Date());

      const out = await runAutoUpdates();
      await auditAutoUpdateRun(out);

      // Only bounce the server if something actually changed on disk.
      if (out.applied.length > 0) requestRebuildAndRestart();
    } catch (e) {
      // Never fatal: a broken update check must not take the dashboard down.
      console.error("[updates] scheduled run failed:", e);
    }
  };

  // Not on boot: the launcher may still be settling, and an immediate rebuild-restart loop
  // is the one failure mode with no way out from the UI.
  const timer = setInterval(tick, TICK_MS);
  timer.unref?.();
}
