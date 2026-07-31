import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * The hand-off that lets "Update everything" run JonDash first, then its add-ons. One click cannot
 * do both in a single pass — core's update hands over to the launcher, which restarts the process
 * running the click — so the add-on half is written down and picked up after the restart.
 *
 * ⚠ Core goes FIRST: a new module version may require the newer JonDash (`minAppVersion`), never
 * the other way round, so updating add-ons first refuses exactly what the user asked for.
 * ⚠ The queue lives in `.data/`, which the updater preserves across an update. Anywhere else and
 * it does not survive the restart it exists for.
 * REFS app/admin/updates/selection-actions.ts — writes and drains it
 *      app/(app)/update-complete/continue-addons.tsx — the second stage
 */

const QUEUE_FILE = path.join(process.cwd(), ".data", "pending-addon-updates");

/**
 * `consented` carries the permission approvals across the restart — REFS lib/modules/permissions.ts
 */
export type PendingAddons = { moduleIds: string[]; helperIds: string[]; consented: string[] };

/** Record the add-ons to update once JonDash's own update has landed.
 *  REFS app/admin/updates/selection-actions.ts  PINS tests/unit/update-queue.test.ts */
export function queueAddonUpdates(pending: PendingAddons): void {
  if (pending.moduleIds.length === 0 && pending.helperIds.length === 0) return;
  try {
    fs.mkdirSync(path.dirname(QUEUE_FILE), { recursive: true });
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(pending), "utf8");
  } catch {
    /* best effort — the core update still proceeds, the add-ons just aren't chained */
  }
}

/** Is a second stage waiting? Cheap; safe on a page render.
 *  REFS app/(app)/update-complete/page.tsx  PINS tests/unit/update-queue.test.ts */
export function hasQueuedAddonUpdates(): boolean {
  return fs.existsSync(QUEUE_FILE);
}

/**
 * Read the queue AND delete it in the same call. ⚠ Consume-on-read on purpose: if the add-on stage
 * then fails it must not retry forever on every boot, which is a restart loop an admin can only
 * stop from the filesystem.
 * REFS app/admin/updates/selection-actions.ts  PINS tests/unit/update-queue.test.ts
 */
export function takeQueuedAddonUpdates(): PendingAddons | null {
  let raw: string;
  try {
    raw = fs.readFileSync(QUEUE_FILE, "utf8");
  } catch {
    return null;
  }
  clearQueuedAddonUpdates();
  try {
    const parsed = JSON.parse(raw) as Partial<PendingAddons>;
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    const pending: PendingAddons = {
      moduleIds: list(parsed.moduleIds),
      helperIds: list(parsed.helperIds),
      consented: list(parsed.consented),
    };
    return pending.moduleIds.length || pending.helperIds.length ? pending : null;
  } catch {
    return null; // unreadable queue — drop it rather than guess
  }
}

/** PINS tests/unit/update-queue.test.ts — no core caller besides `takeQueuedAddonUpdates` above */
export function clearQueuedAddonUpdates(): void {
  try {
    fs.rmSync(QUEUE_FILE, { force: true });
  } catch {
    /* best effort */
  }
}
