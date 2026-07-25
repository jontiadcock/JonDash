import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * The hand-off that lets "Update everything" run **JonDash first, then its add-ons**.
 *
 * Core and add-ons are applied by different machinery — JonDash's own update goes out to the
 * launcher, which rebuilds and restarts the whole process, while modules and helpers are
 * applied in-process. A single click therefore cannot do both in one pass: the process
 * running the click disappears halfway through.
 *
 * So the add-on half is written down first and picked up after the restart. The queue lives
 * in `.data/` because the updater deliberately preserves that directory across an update.
 *
 * **Core goes first on purpose:** a new module version may require the newer JonDash
 * (`minAppVersion`), never the other way round. Updating add-ons first would refuse exactly
 * the updates the user asked for.
 */

const QUEUE_FILE = path.join(process.cwd(), ".data", "pending-addon-updates");

export type PendingAddons = { moduleIds: string[]; helperIds: string[]; consented: string[] };

/** Record the add-ons to update once JonDash's own update has landed. */
export function queueAddonUpdates(pending: PendingAddons): void {
  if (pending.moduleIds.length === 0 && pending.helperIds.length === 0) return;
  try {
    fs.mkdirSync(path.dirname(QUEUE_FILE), { recursive: true });
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(pending), "utf8");
  } catch {
    /* best effort — the core update still proceeds, the add-ons just aren't chained */
  }
}

/** Is a second stage waiting? Cheap check, safe to call on a page render. */
export function hasQueuedAddonUpdates(): boolean {
  return fs.existsSync(QUEUE_FILE);
}

/**
 * Read the queue **and delete it in the same call**.
 *
 * Deliberately consume-on-read: if the add-on stage then fails, it must not be retried
 * forever on every boot. One attempt, reported honestly, is better than a restart loop that
 * an admin has to break into the filesystem to stop.
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
    return null; // unreadable queue: drop it rather than guess
  }
}

export function clearQueuedAddonUpdates(): void {
  try {
    fs.rmSync(QUEUE_FILE, { force: true });
  } catch {
    /* best effort */
  }
}
