import { prisma } from "@/lib/db";

/** Wipe all rows so each test starts from a clean database. ⚠ Every model must be listed here, in
 *  FK order — a model added to the schema and forgotten here leaks rows between test files, and the
 *  symptom is a test that passes alone and fails in a suite.
 *  REFS prisma/schema.prisma — the list this must mirror */
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
