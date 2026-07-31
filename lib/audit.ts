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
 * Append a security-relevant event to the audit log, best-effort.
 *
 * ⚠ The two steps must stay in SEPARATE try blocks (BUG-29). `headers()` throws outside a request
 * scope — every scheduled or background action — and while it shared a `try` with the write, that
 * throw happened first and the catch swallowed it: no row, no error, no signal, and no caller could
 * tell because this returns `Promise<void>`.
 * ⚠ The request context is ENRICHMENT. Losing it costs the `ip` column, never the row.
 * REFS auditOrThrow() below — the fail-closed variant, for granting privilege
 * PINS tests/unit/audit.test.ts — called from ~45 places across app/ and lib/
 */
export async function audit(
  action: string,
  opts: { userId?: string | null; detail?: string } = {},
): Promise<void> {
  let ip: string | undefined;
  // Whether a request was in scope is the only authoritative signal, and only available here. It
  // lets the log say "the schedule did this" rather than a blank that reads as "we don't know".
  let source: AuditSource = "system";
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined;
    source = "request";
  } catch {
    // No request in scope: background work. Leave ip undefined and still record the event.
  }

  try {
    await writeRow(action, opts, ip, source);
  } catch {
    // Never let audit logging break the primary flow.
  }
}

/**
 * The single write path, with one deliberate rescue: ⚠ an unattributable actor must not cost the
 * whole row.
 *
 * `userId` is a foreign key, so a stale or synthetic id — routine for a helper acting for a user
 * since deleted — fails the insert on a constraint, and `audit()` swallows it. That is a
 * privileged action with no trace, the one outcome the log exists to prevent. A failed write is
 * retried once with no actor and a note saying why — losing "who" is far smaller than losing
 * "what happened". A second failure means the database is unreachable, and propagates.
 * REFS auditOrThrow() below — depends on this rescue to stay usable
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
    // Nothing to rescue — no actor to drop, so this is a real write failure.
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
 * Same write, but it THROWS when the row genuinely cannot be recorded.
 * ⚠ Use it to write the INTENT before a privileged action, and refuse the action if it throws.
 * `audit()` swallowing failures is right everywhere except where "audited" and "attempted to
 * audit" are different promises.
 * ⚠ What makes it usable is the rescue in `writeRow` — an unattributable actor degrades to an
 * unattributed row, so only a real outage reaches the caller and an ordinary stale id cannot
 * block a legitimate privileged action.
 * REFS lib/elevation.ts › invoke() — the asymmetry: granting is refused without a record,
 *      revoking proceeds, because failing to revoke is the worse outcome
 * PINS tests/unit/audit.test.ts
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
    // No request in scope — enrichment only. Never a reason to fail.
  }

  // Same rescue as `audit()`: an unresolvable actor degrades to an unattributed row, so only a
  // genuine write failure propagates and fails the caller closed.
  await writeRow(action, opts, ip, source);
}

/**
 * Delete audit events older than the configured retention window; returns the number removed. A
 * retention of 0 means "keep forever". Best-effort.
 * REFS app/admin/audit/page.tsx — the only caller, prunes on view
 *      lib/settings.ts › getAuditRetentionDays() — where the window is configured
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
