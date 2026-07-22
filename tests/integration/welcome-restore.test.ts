import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { serializeBackup, parseBackup, applyRestore } from "@/lib/backup";
import { reloadEncryptionKey } from "@/lib/config";
import { hasActiveAdmin } from "@/lib/auth/bootstrap";
import { resetDb } from "../helpers";

// The first-run restore action gates on hasActiveAdmin() and, on success, relies
// on the restore producing a signed-in-able admin. These check that guarantee.
// Uses an isolated temp .data so the encrypted export/restore never touches the
// real install's key/config.
let DATA: string;
const KEY = "c".repeat(64);

beforeAll(() => {
  DATA = fs.mkdtempSync(path.join(os.tmpdir(), "jd-welcome-data-"));
  process.env.JONDASH_DATA_DIR = DATA;
  fs.writeFileSync(path.join(DATA, "secrets.json"), JSON.stringify({ encryptionKey: KEY }));
  reloadEncryptionKey();
});
afterAll(async () => {
  delete process.env.JONDASH_DATA_DIR;
  fs.rmSync(DATA, { recursive: true, force: true });
  await prisma.$disconnect();
});
beforeEach(resetDb);

describe("first-run restore", () => {
  it("restoring an encrypted backup with an admin marks the install as set up", async () => {
    await prisma.user.create({
      data: { email: "a@x.com", role: "ADMIN", status: "ACTIVE", passwordHash: "h", totpSecretEnc: "enc", mfaEnabled: true },
    });
    const zip = await serializeBackup("Str0ng-Pass!");

    await resetDb(); // simulate a brand-new install
    expect(await hasActiveAdmin()).toBe(false);

    const parsed = parseBackup(zip, "Str0ng-Pass!");
    await applyRestore(parsed.data, parsed.includes, parsed.iconFiles);

    expect(await hasActiveAdmin()).toBe(true); // now set up → first-run closes, sign in works
  });

  it("a plain backup without accounts leaves the install still needing setup", async () => {
    await prisma.serviceRole.create({ data: { name: "Team" } });
    const zip = await serializeBackup(null);

    await resetDb();
    const parsed = parseBackup(zip, null);
    // Restore only roles (no admin account present to restore).
    await applyRestore(parsed.data, parsed.includes, parsed.iconFiles);

    expect(await hasActiveAdmin()).toBe(false); // no admin restored → wizard stays open
  });
});
