import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { getAuditRetentionDays } from "@/lib/settings";

/**
 * Who drove an audited event.
 *  - "request": somebody acting in the browser (has an IP, usually a userId).
 *  - "system":  scheduled or background work — a module's timed task, a helper's run.
 *               No request exists, so there is no IP and usually no user.
 */
export type AuditSource = "request" | "system";

/**
 * Append a security-relevant event to the audit log (best-effort).
 *
 * The two steps are deliberately in SEPARATE try blocks (BUG-29). `headers()` throws
 * outside a request scope — which is every scheduled or background action, including a
 * module's timed work — and while it shared a `try` with the write, that throw happened
 * *before* the write and the catch swallowed it. No row, no error, no signal: background
 * work was silently unauditable, and a caller couldn't tell because this returns
 * `Promise<void>` and eats its own failures.
 *
 * The request context is optional ENRICHMENT. Losing it must cost the `ip` column, never
 * the row.
 */
export async function audit(
  action: string,
  opts: { userId?: string | null; detail?: string } = {},
): Promise<void> {
  let ip: string | undefined;
  // Whether a request was in scope is the ONLY authoritative signal for this, and it is
  // only available here. Recording it is what lets the log say "the schedule did this"
  // rather than leaving a blank actor that reads as "we don't know who did this".
  let source: AuditSource = "system";
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined;
    source = "request";
  } catch {
    // No request in scope: background work. Leave ip undefined, mark it as system, and
    // still record the event.
  }

  try {
    await writeRow(action, opts, ip, source);
  } catch {
    // Never let audit logging break the primary flow.
  }
}

/**
 * The single write path, with one deliberate rescue: **an unattributable actor must not cost
 * the whole row.**
 *
 * `userId` is a foreign key. A stale or synthetic id — an ordinary mistake for a helper acting
 * on behalf of a user who has since been deleted — makes `create` fail with a constraint
 * violation, and `audit()` then swallows it. The result is a privileged action with no trace,
 * which is the one outcome an audit log exists to prevent.
 *
 * Reported by the add-ons session (2026-07-25) with a repro on the *normal* path: a grant was
 * created and the task ran, with no audit row, because the id didn't resolve.
 *
 * So a failed write is retried once with **no actor and a note saying why**. Losing "who" is a
 * far smaller loss than losing "what happened", and recording "we could not attribute this" is
 * honest where a missing row is merely silent. If the retry fails too — the database is
 * genuinely unreachable — the error propagates and the caller decides.
 */
async function writeRow(
  action: string,
  opts: { userId?: string | null; detail?: string },
  ip: string | undefined,
  source: AuditSource,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: { action, userId: opts.userId ?? undefined, detail: opts.detail, ip, source },
    });
  } catch (err) {
    // Nothing to rescue: there was no actor to drop, so this is a real write failure.
    if (opts.userId == null) throw err;

    const note = `actor "${opts.userId}" could not be attributed`;
    await prisma.auditLog.create({
      data: {
        action,
        userId: null,
        detail: opts.detail ? `${opts.detail} · ${note}` : note,
        ip,
        source,
      },
    });
  }
}

/**
 * Same write, but it THROWS when the row genuinely can't be recorded.
 *
 * `audit()` swallowing its own failures is right almost everywhere — losing a log line must
 * not break a working feature. It is wrong for an action that *grants privilege*, where
 * "audited" and "attempted to audit" are different things and only one of them is what was
 * promised. Reported by the add-ons session 2026-07-25: a `removeAllGrants` succeeded while
 * the audit write failed, so a privileged action happened with no record of it.
 *
 * Note the ordering that makes this usable: an unattributable actor is rescued by `writeRow`
 * into an unattributed row, so only a real outage reaches the caller. Without that, the
 * fail-closed behaviour would turn an ordinary stale-id mistake into a blocked feature.
 *
 * Use this to write the INTENT *before* a privileged action, and refuse the action if it
 * throws. Note the deliberate asymmetry — see `lib/elevation.ts`: granting privilege without
 * a record is refused, revoking privilege without a record proceeds, because failing to
 * revoke is the worse outcome of the two.
 */
export async function auditOrThrow(
  action: string,
  opts: { userId?: string | null; detail?: string } = {},
): Promise<void> {
  let ip: string | undefined;
  let source: AuditSource = "system";
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined;
    source = "request";
  } catch {
    // No request in scope — enrichment only, same as above. Never a reason to fail.
  }

  // Same rescue as `audit()`: an unresolvable actor degrades to an unattributed row rather
  // than throwing, so a stale id never blocks a legitimate privileged action. Only a genuine
  // write failure — the database unreachable — propagates and fails the caller closed.
  await writeRow(action, opts, ip, source);
}

/**
 * Delete audit events older than the configured retention window. Returns the
 * number removed. A retention of 0 means "keep forever" (no-op). Best-effort.
 */
export async function pruneAuditLog(): Promise<number> {
  try {
    const days = await getAuditRetentionDays();
    if (days <= 0) return 0;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const res = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return res.count;
  } catch {
    return 0;
  }
}
