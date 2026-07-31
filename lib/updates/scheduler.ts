import "server-only";
import fs from "node:fs";
import path from "node:path";
import { readUpdateSchedule, isRunDue } from "./schedule";
import { runAutoUpdates, auditAutoUpdateRun, anythingOptedIn } from "./auto-run";
import { requestRebuildAndRestart } from "@/lib/modules/rebuild";

/**
 * The thing that makes automatic updates actually happen (BUG-30). Started once at boot, because
 * work that only runs when someone opens a page is not scheduled work.
 *
 * ⚠ The last-run timestamp lives in `.data/`, NOT the database. Restoring a backup taken before
 * the last run would otherwise leave the scheduler overdue, and it would rebuild and restart the
 * machine you had just restored.
 * REFS instrumentation.ts — starts it · ./schedule.ts › isRunDue() · ./auto-run.ts
 */

const DATA_DIR = path.join(process.cwd(), ".data");
const LAST_RUN_FILE = path.join(DATA_DIR, "auto-update-last-run");

// Checked every 15 minutes. The window is "has the due moment passed", not "is it exactly
// 03:00", so a coarse tick cannot miss it and a box that was asleep still updates on waking.
const TICK_MS = 15 * 60 * 1000;

/** ⚠ No caller inside core other than the tick below — it is exported for inspection, so a
 *  change here must not assume the file is only read once. REFS ./schedule.ts › isRunDue() */
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

/** REFS instrumentation.ts — the only caller, once per boot */
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
        // ⚠ Establish the baseline and wait: without this a fresh install reads as overdue
        // and restarts itself. REFS ./schedule.ts › isRunDue() returns false with no baseline
        writeLastRun(new Date());
        return;
      }
      if (!isRunDue(schedule, lastRun, new Date())) return;

      // ⚠ Recorded BEFORE the work: a crash mid-update must not leave the scheduler retrying
      // a rebuild every 15 minutes.
      writeLastRun(new Date());

      const out = await runAutoUpdates();
      await auditAutoUpdateRun(out);

      /*
       * ⚠ A JonDash update SUPERSEDES a module rebuild rather than adding to it — applying one
       * hands over to the launcher, which rebuilds the whole install and carries every module
       * updated in this run along with it. Asking for both queues a second, pointless restart.
       * REFS lib/update.ts › requestUpdateRestart() · lib/modules/rebuild.ts
       */
      if (out.appUpdate) {
        const { requestUpdateRestart } = await import("@/lib/update");
        requestUpdateRestart();
        return;
      }

      // Only bounce the server if something actually changed on disk.
      if (out.applied.length > 0) requestRebuildAndRestart();
    } catch (e) {
      // ⚠ Never fatal — a broken update check must not take the dashboard down.
      console.error("[updates] scheduled run failed:", e);
    }
  };

  // ⚠ Not on boot: the launcher may still be settling, and an immediate rebuild-restart loop
  // is the one failure mode with no way out from the UI.
  const timer = setInterval(tick, TICK_MS);
  timer.unref?.();
}
