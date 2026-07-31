import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * A fresh value every time this process starts. ⚠ A liveness nonce, NOT the session cutoff — see
 * `SESSION_EPOCH` below for that.
 *
 * REFS app/api/health/route.ts — publishes it, which is how a client detects the NEW process
 *      app/components/server-wait-overlay.tsx — the client that watches for the change
 *      lib/auth/preauth.ts — ties the short-lived pre-auth cookie to this run
 *      app/api/server/restart/route.ts · shutdown/route.ts · app/api/update/apply/route.ts
 */
export const SERVER_BOOT_TIME = Date.now();

const DATA_DIR = path.join(process.cwd(), ".data");

/**
 * The "sign everyone out" cutoff: a session created before this is rejected. It advances to `now`
 * every boot — so a crash, a cold start, or a folder copied elsewhere invalidates every session —
 * unless `.data/post-update` or `.data/keep-sessions` marks a graceful app-initiated restart. A
 * missing or garbled epoch file falls back to `now` — the invalidating direction, so keep it.
 * ⚠ NEITHER marker may be deleted here; the supervisor clears them after a healthy boot. This
 * module is evaluated more than once per start (instrumentation, then an app-route bundle on first
 * request), so a delete-on-read lets the SECOND find none and advance past new sessions.
 * REFS lib/auth/session.ts — the only reader · scripts/supervise.mjs — clears both markers
 *      lib/server-control.ts › markKeepSessions() — the writer; rebuild.ts calls it too
 * PINS tests/unit/session-epoch.test.ts
 */
export const SESSION_EPOCH: number = sessionEpochFor(DATA_DIR);

/**
 * When this OS PROCESS started — identical in every bundle of the same process, unlike a
 * module-level `Date.now()`, which is whenever that bundle happened to load. That is what lets a
 * record on disk say which run decided it. Rounded, because `process.uptime()` is a float.
 */
function processStartedAt(): number {
  return Math.round(Date.now() - process.uptime() * 1000);
}

/**
 * The session epoch for this process — decided ONCE per run, then reused by every caller.
 *
 * ⚠ The decision cannot be re-taken per bundle. Next loads route bundles lazily, on first request,
 * so "reuse or advance?" was being answered minutes after start — by which time the supervisor had
 * cleared the graceful-restart marker, and that late evaluation signed the whole instance out.
 * The record on disk therefore carries WHICH RUN decided it (`decidedBy`); a process finding its
 * own stamp just reads the value, so marker state is read once, while it still means something.
 *
 * PINS tests/unit/session-epoch.test.ts
 */
export function sessionEpochFor(dataDir: string): number {
  const started = processStartedAt();
  const stored = readEpochRecord(dataDir);
  // Already decided by this run, by whichever bundle loaded first — agree with it.
  if (stored && Math.abs(stored.decidedBy - started) < 2000) return stored.epoch;
  return computeSessionEpoch(dataDir, Date.now());
}

type EpochRecord = { epoch: number; decidedBy: number };

function readEpochRecord(dataDir: string): EpochRecord | null {
  try {
    const raw = fs.readFileSync(path.join(dataDir, "session-epoch"), "utf8").trim();
    // Older installs stored a bare number. Treating it as "decided by a previous run" is the
    // safe reading — this run then decides for itself.
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
 * Decide the epoch for a fresh run and persist it. ⚠ Neither marker is deleted here — the
 * supervisor clears them after a healthy boot, and a shutdown clears keep-sessions itself.
 * Exported for the test. PINS tests/unit/session-epoch.test.ts
 */
export function computeSessionEpoch(dataDir: string, now: number): number {
  const epochFile = path.join(dataDir, "session-epoch");
  const postUpdate = path.join(dataDir, "post-update");
  const keepSessions = path.join(dataDir, "keep-sessions");
  const previousRecord = readEpochRecord(dataDir);
  const previous = previousRecord?.epoch ?? null;
  // A graceful restart — an update, an in-app restart, or a rebuild — reuses the previous epoch
  // so everyone stays signed in; anything else advances to now.
  const graceful = fs.existsSync(postUpdate) || fs.existsSync(keepSessions);
  const epoch = previous != null && graceful ? previous : now;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    // ⚠ Stamped with the run that decided it, so later-loading bundles in THIS process reuse the
    // value instead of re-deciding once the markers have been cleared.
    const record: EpochRecord = { epoch, decidedBy: processStartedAt() };
    fs.writeFileSync(epochFile, JSON.stringify(record));
  } catch {
    /* best effort; if we can't persist, next boot advances — the safe direction */
  }
  return epoch;
}
