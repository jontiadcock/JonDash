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
 * It normally advances to `now` on every boot, so an **unexpected** restart (a crash, or a
 * folder copied to another machine and started fresh) and a **shutdown → cold start**
 * invalidate every prior session.
 *
 * A **graceful, app-initiated restart keeps everyone signed in** (owner request). Two markers
 * signal that:
 *   - `.data/post-update` — written by the launcher while applying an **update**. It ALSO
 *     drives the launcher's crash-revert (`start-dashboard.bat`), so it must survive until the
 *     new build is proven healthy — the supervisor clears it, never this function.
 *   - `.data/keep-sessions` — written by the app just before an **in-app restart** or a
 *     **module rebuild** (`lib/server-control.ts`, `lib/modules/rebuild.ts`). Like
 *     `post-update` it is cleared by the **supervisor** once the new build is healthy — NOT
 *     here. That matters: the server evaluates this module more than once per start (the
 *     `instrumentation` startup bundle, then the app-route bundle on the first request), so a
 *     delete-on-read would let the *second* evaluation find no marker and advance the epoch
 *     right past a freshly-created session. Leaving the marker in place means every evaluation
 *     of one start agrees to reuse. `requestServerShutdown` deletes it so an explicit shutdown
 *     still signs out even if it follows a restart before the healthy-clear.
 *
 * A **shutdown writes neither marker** (and clears any leftover), so the next cold start
 * advances the epoch and signs everyone out — the one intentional stop that isn't a
 * session-preserving restart.
 *
 * Security note: keeping sessions across a graceful boot doesn't widen the trust boundary.
 * Forging a marker needs local filesystem access, and the sessions table stores only token
 * *hashes* — a valid session still needs a raw cookie token an attacker can't get from the
 * files. A missing/garbled epoch file falls back to `now`, the safe (invalidating) direction.
 */
export const SESSION_EPOCH: number = computeSessionEpoch(DATA_DIR, Date.now());

/**
 * Pure-ish core of the epoch rule, exported for tests. Reads the previous epoch and the two
 * graceful-restart markers from `dataDir`, returns the epoch to use, and persists it. Neither
 * marker is deleted here — see the note above on why (multiple evaluations per start). The
 * supervisor clears them after a healthy boot; a shutdown clears keep-sessions itself.
 */
export function computeSessionEpoch(dataDir: string, now: number): number {
  const epochFile = path.join(dataDir, "session-epoch");
  const postUpdate = path.join(dataDir, "post-update");
  const keepSessions = path.join(dataDir, "keep-sessions");
  let previous: number | null = null;
  try {
    const n = Number.parseInt(fs.readFileSync(epochFile, "utf8").trim(), 10);
    if (Number.isFinite(n)) previous = n;
  } catch {
    /* first boot — no epoch yet */
  }
  // A graceful restart (update OR an in-app restart/rebuild) reuses the previous epoch so
  // everyone stays signed in; anything else advances to now. `previous != null` first so the
  // compiler narrows it to a number in the reuse branch. Idempotent across the several
  // evaluations of one start because the marker is left in place until the boot is healthy.
  const graceful = fs.existsSync(postUpdate) || fs.existsSync(keepSessions);
  const epoch = previous != null && graceful ? previous : now;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(epochFile, String(epoch));
  } catch {
    /* best effort; if we can't persist, next boot advances — the safe direction */
  }
  return epoch;
}
