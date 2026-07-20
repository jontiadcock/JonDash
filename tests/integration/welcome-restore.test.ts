import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { serializeBackup, parseBackup, applyRestore } from "@/lib/backup";
import { hasActiveAdmin } from "@/lib/auth/bootstrap";
import { resetDb } from "../helpers";

// The first-run restore action gates on hasActiveAdmin() and, on success, relies
// on the restore producing a signed-in-able admin. These check that guarantee.
beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("first-run restore", () => {
  it("restoring an encrypted backup with an admin marks the install as set up", async () => {
    await prisma.user.create({
      data: { email: "a@x.com", role: "ADMIN", status: "ACTIVE", passwordHash: "h", totpSecretEnc: "enc", mfaEnabled: true },
    });
    const zip = await serializeBackup(["users"], "pw-123");

    await resetDb(); // simulate a brand-new install
    expect(await hasActiveAdmin()).toBe(false);

    const parsed = parseBackup(zip, "pw-123");
    await applyRestore(parsed.data, parsed.includes, parsed.iconFiles);

    expect(await hasActiveAdmin()).toBe(true); // now set up → first-run closes, sign in works
  });

  it("a plain backup without accounts leaves the install still needing setup", async () => {
    await prisma.serviceRole.create({ data: { name: "Team" } });
    const zip = await serializeBackup(["roles"], null);

    await resetDb();
    const parsed = parseBackup(zip, null);
    await applyRestore(parsed.data, parsed.includes, parsed.iconFiles);

    expect(await hasActiveAdmin()).toBe(false); // no admin restored → wizard stays open
  });
});
