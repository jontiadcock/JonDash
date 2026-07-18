import "server-only";
import { prisma } from "@/lib/db";

/** Whether an admin has finished setup. Drives the first-run wizard. */
export async function hasActiveAdmin(): Promise<boolean> {
  const count = await prisma.user.count({
    where: { role: "ADMIN", status: "ACTIVE" },
  });
  return count > 0;
}

/** The admin currently mid-way through first-run setup, if any. */
export async function getPendingAdmin() {
  return prisma.user.findFirst({
    where: { role: "ADMIN", status: "PENDING_SETUP" },
    orderBy: { createdAt: "asc" },
  });
}
