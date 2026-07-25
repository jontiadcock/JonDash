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
export const SESSION_EPOCH: number = sessionEpochFor(DATA_DIR);

/**
 * When this OS process started. Identical in every bundle of the same process (unlike a
 * module-level `Date.now()`, which is whenever that particular bundle happened to load), so
 * it can be used to tell "the epoch on disk was decided by THIS run" from "…by a previous
 * one". Rounded, because `process.uptime()` is a float.
 */
function processStartedAt(): number {
  return Math.round(Date.now() - process.uptime() * 1000);
}

/**
 * The session epoch for this process — decided **once per run**, then reused by every caller.
 *
 * This function exists because the obvious version was wrong in a way that only showed up in
 * production. `lib/boot` is imported by several route bundles, and Next loads those **lazily,
 * on first request**. The decision "reuse the epoch or advance it?" was therefore re-taken
 * whenever a bundle happened to load — including minutes after start, by which time the
 * supervisor had cleared the graceful-restart marker. That late evaluation saw no marker,
 * advanced the epoch past everyone's freshly-created sessions, and signed the whole instance
 * out. Applying an update looked fine and then logged you out the moment you navigated
 * somewhere new.
 *
 * So the record on disk now carries **which run decided it** (`decidedBy`). A process that
 * finds its own stamp just reads the value; only the first caller in a run makes the
 * decision. Marker state is then read exactly once per boot, when it is still meaningful.
 */
export function sessionEpochFor(dataDir: string): number {
  const started = processStartedAt();
  const stored = readEpochRecord(dataDir);
  // Decided by this run already (by whichever bundle loaded first) — just agree with it.
  if (stored && Math.abs(stored.decidedBy - started) < 2000) return stored.epoch;
  return computeSessionEpoch(dataDir, Date.now());
}

type EpochRecord = { epoch: number; decidedBy: number };

function readEpochRecord(dataDir: string): EpochRecord | null {
  try {
    const raw = fs.readFileSync(path.join(dataDir, "session-epoch"), "utf8").trim();
    // Older installs stored a bare number; treat it as "decided by a previous run", which is
    // the safe reading — this run then decides for itself.
    if (/^\d+$/.test(raw)) return { epoch: Number.parseInt(raw, 10), decidedBy: 0 };
    const parsed = JSON.parse(raw) as Partial<EpochRecord>;
    if (typeof parsed.epoch === "number" && typeof parsed.decidedBy === "number") {
      return { epoch: parsed.epoch, decidedBy: parsed.decidedBy };
    }
  } catch {
    /* absent or unreadable — the caller decides afresh */
  }
  return null;
}

/**
 * Decide the epoch for a fresh run and persist it, exported for tests. Reads the previous
 * epoch and the two graceful-restart markers from `dataDir`. Neither marker is deleted here —
 * the supervisor clears them after a healthy boot; a shutdown clears keep-sessions itself.
 */
export function computeSessionEpoch(dataDir: string, now: number): number {
  const epochFile = path.join(dataDir, "session-epoch");
  const postUpdate = path.join(dataDir, "post-update");
  const keepSessions = path.join(dataDir, "keep-sessions");
  const previousRecord = readEpochRecord(dataDir);
  const previous = previousRecord?.epoch ?? null;
  // A graceful restart (update OR an in-app restart/rebuild) reuses the previous epoch so
  // everyone stays signed in; anything else advances to now.
  const graceful = fs.existsSync(postUpdate) || fs.existsSync(keepSessions);
  const epoch = previous != null && graceful ? previous : now;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    // Stamped with the run that decided it, so later-loading bundles in THIS process reuse
    // the value instead of re-deciding once the markers have been cleared.
    const record: EpochRecord = { epoch, decidedBy: processStartedAt() };
    fs.writeFileSync(epochFile, JSON.stringify(record));
  } catch {
    /* best effort; if we can't persist, next boot advances — the safe direction */
  }
  return epoch;
}
