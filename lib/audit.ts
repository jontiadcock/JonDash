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
    await prisma.auditLog.create({
      data: {
        action,
        userId: opts.userId ?? undefined,
        detail: opts.detail,
        ip,
        source,
      },
    });
  } catch {
    // Never let audit logging break the primary flow.
  }
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
