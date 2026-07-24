import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * A fresh value every time this process starts (evaluated once, at module load).
 *
 * Reported by the public `/api/health` endpoint so a client waiting out a restart/update can
 * detect the *new* process — the value changes on every boot — before it reconnects. Also
 * still ties the short-lived pre-auth login cookie (`lib/auth/preauth.ts`) to this run. This
 * is a liveness nonce, NOT the full-session cutoff; see SESSION_EPOCH for that.
 */
export const SERVER_BOOT_TIME = Date.now();

const DATA_DIR = path.join(process.cwd(), ".data");

/**
 * The "sign everyone out" cutoff (`lib/auth/session.ts`): a session created before this is
 * rejected.
 *
 * It normally advances to `now` on every boot, so a **restart** — or a folder copied to
 * another machine and started fresh — invalidates every prior session, exactly as before.
 *
 * An **update** is the one exception (owner request): the launcher writes `.data/post-update`
 * only while applying an update, and on that boot we REUSE the previous epoch, so the admin
 * who clicked "update" and everyone else stays signed in across it. The marker is cleared
 * once the new build is proven healthy, so it can never leak into an ordinary restart.
 *
 * Security note: keeping sessions across a post-update boot doesn't widen the trust boundary.
 * Forging the marker needs local filesystem access, and the sessions table stores only token
 * *hashes* — a valid session still needs a raw cookie token an attacker can't get from the
 * files. A missing/garbled epoch file falls back to `now`, the safe (invalidating) direction.
 */
export const SESSION_EPOCH: number = computeSessionEpoch(DATA_DIR, Date.now());

/**
 * Pure-ish core of the epoch rule, exported for tests. Reads the previous epoch and the
 * post-update marker from `dataDir`, returns the epoch to use, and persists it.
 */
export function computeSessionEpoch(dataDir: string, now: number): number {
  const epochFile = path.join(dataDir, "session-epoch");
  const postUpdate = path.join(dataDir, "post-update");
  let previous: number | null = null;
  try {
    const n = Number.parseInt(fs.readFileSync(epochFile, "utf8").trim(), 10);
    if (Number.isFinite(n)) previous = n;
  } catch {
    /* first boot — no epoch yet */
  }
  // Reuse the previous epoch only on a post-update boot; otherwise advance to now. Inlined
  // so the compiler narrows `previous` to a number in the reuse branch.
  const epoch = previous != null && fs.existsSync(postUpdate) ? previous : now;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(epochFile, String(epoch));
  } catch {
    /* best effort; if we can't persist, next boot advances — the safe direction */
  }
  return epoch;
}
