import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  generateBackupCodes,
  consumeBackupCode,
  backupCodeStatus,
  BACKUP_CODE_COUNT,
} from "@/lib/auth/backup-codes";
import { resetDb } from "../helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function makeUser() {
  return prisma.user.create({ data: { email: "codes@t.local", role: "USER", status: "ACTIVE" } });
}

describe("2FA backup codes", () => {
  it("generates a full set of unique codes", async () => {
    const user = await makeUser();
    const codes = await generateBackupCodes(user.id);
    expect(codes).toHaveLength(BACKUP_CODE_COUNT);
    expect(new Set(codes).size).toBe(BACKUP_CODE_COUNT);
    expect(await backupCodeStatus(user.id)).toEqual({ remaining: 10, total: 10 });
  });

  it("consumes a code once and refuses reuse", async () => {
    const user = await makeUser();
    const [first] = await generateBackupCodes(user.id);

    expect(await consumeBackupCode(user.id, first)).toBe(true);
    expect((await backupCodeStatus(user.id)).remaining).toBe(9);

    // Same code again — must fail (single-use).
    expect(await consumeBackupCode(user.id, first)).toBe(false);
  });

  it("accepts codes regardless of dashes/case/spacing", async () => {
    const user = await makeUser();
    const [first] = await generateBackupCodes(user.id);
    const messy = ` ${first.replace("-", "").toLowerCase()} `;
    expect(await consumeBackupCode(user.id, messy)).toBe(true);
  });

  it("rejects an invalid code", async () => {
    const user = await makeUser();
    await generateBackupCodes(user.id);
    expect(await consumeBackupCode(user.id, "ZZZZZ-ZZZZZ")).toBe(false);
  });

  it("regenerating invalidates the previous set", async () => {
    const user = await makeUser();
    const [oldCode] = await generateBackupCodes(user.id);
    await generateBackupCodes(user.id); // fresh set
    expect(await consumeBackupCode(user.id, oldCode)).toBe(false);
    expect(await backupCodeStatus(user.id)).toEqual({ remaining: 10, total: 10 });
  });
});
