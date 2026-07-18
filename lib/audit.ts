import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { getAuditRetentionDays } from "@/lib/settings";

/** Append a security-relevant event to the audit log (best-effort). */
export async function audit(
  action: string,
  opts: { userId?: string | null; detail?: string } = {},
): Promise<void> {
  try {
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined;
    await prisma.auditLog.create({
      data: {
        action,
        userId: opts.userId ?? undefined,
        detail: opts.detail,
        ip,
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
