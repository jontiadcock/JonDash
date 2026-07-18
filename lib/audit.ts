import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";

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
