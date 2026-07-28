import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { inspectBackup } from "@/lib/backup";

/**
 * Reading a backup's envelope **without its passphrase** (1.8.0, plan items 9.5 / 9.6).
 *
 * Owner, 2026-07-28: *"if you are restoring a file that is encrypted, it auto detects it and asks
 * for the password."* Everything below exists to make that answer trustworthy, because the whole
 * design rests on it: the restore screens now decide whether to ask for a passphrase *at all* from
 * what this returns. Get it wrong in the "not encrypted" direction and someone is refused a
 * passphrase field for a file that needs one — the exact dead end this replaced.
 */
function envelope(fields: Record<string, unknown>): Uint8Array {
  return zipSync({ "backup.json": strToU8(JSON.stringify(fields)) });
}

const base = {
  app: "JonDash",
  formatVersion: 4,
  exportedAt: "2026-07-29T00:00:00.000Z",
  includes: ["users", "settings"],
};

describe("inspectBackup", () => {
  it("reports an encrypted backup as encrypted, with no passphrase involved", () => {
    const res = inspectBackup(envelope({ ...base, encrypted: true, ciphertext: "…" }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.encrypted).toBe(true);
      // The metadata lives outside the ciphertext by design — that is what makes detection possible.
      expect(res.includes).toEqual(["users", "settings"]);
      expect(res.exportedAt).toBe("2026-07-29T00:00:00.000Z");
    }
  });

  it("reports an unencrypted backup as unencrypted", () => {
    const res = inspectBackup(envelope({ ...base, encrypted: false, data: {} }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.encrypted).toBe(false);
  });

  it("treats a missing `encrypted` flag as not encrypted", () => {
    // Rather than throwing. An older or hand-edited envelope still has to produce an answer, and
    // "no passphrase field" is recoverable — the restore itself will still refuse and say why.
    const res = inspectBackup(envelope({ ...base, data: {} }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.encrypted).toBe(false);
  });

  it("refuses a file that isn't a ZIP", () => {
    const res = inspectBackup(strToU8("MZ this is an executable"));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/isn’t a JonDash backup archive/);
  });

  it("refuses a ZIP that isn't a JonDash backup", () => {
    const res = inspectBackup(zipSync({ "notes.txt": strToU8("hello") }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/no backup\.json/);
  });

  it("refuses a backup.json that isn't JSON", () => {
    const res = inspectBackup(zipSync({ "backup.json": strToU8("{{{") }));
    expect(res.ok).toBe(false);
  });

  it("refuses another app's archive that happens to contain backup.json", () => {
    const res = inspectBackup(envelope({ app: "SomethingElse", formatVersion: 4 }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/isn’t a JonDash backup/);
  });

  it("says a newer backup is from a newer JonDash, rather than failing obscurely later", () => {
    const res = inspectBackup(envelope({ ...base, formatVersion: 999, encrypted: true }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/newer version/);
  });

  it("never throws, whatever it is handed", () => {
    // It runs on a file a human just picked, so every wrong answer must be a message.
    for (const bytes of [new Uint8Array(0), new Uint8Array([80, 75, 3, 4]), strToU8("x".repeat(999))]) {
      expect(() => inspectBackup(bytes)).not.toThrow();
    }
  });
});
