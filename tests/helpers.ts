import { prisma } from "@/lib/db";

/** Wipe all rows so each test starts from a clean database. */
export async function resetDb(): Promise<void> {
  await prisma.link.deleteMany();
  await prisma.backupCode.deleteMany();
  await prisma.session.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.user.deleteMany();
  await prisma.serviceRole.deleteMany();
  await prisma.accessRole.deleteMany();
}
