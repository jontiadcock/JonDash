import { describe, it, expect } from "vitest";
import {
  CORE_PERMISSIONS,
  DANGEROUS_PERMISSIONS,
  PERMISSION_WARNINGS,
  describePermission,
  helperIdForPermission,
  isCorePermission,
  isValidPermission,
} from "@/lib/modules/types";

/**
 * Consent wording (MOD-08, reworked in 1.5.1). `describePermission` is the ONLY place a
 * permission becomes a sentence, so every consent surface renders the same thing. The
 * property under test throughout: a capability the admin is about to grant must never
 * render blank, be silently omitted, or be styled as routine when core doesn't know it.
 */

describe("core vs helper-provided permissions", () => {
  it("recognises exactly the four core permissions", () => {
    expect([...CORE_PERMISSIONS].sort()).toEqual(
      ["audit:write", "crypto:use", "email:send", "network:outbound"],
    );
    // The set and the wording table must not drift apart — one is the gate, one is the UI.
    expect([...CORE_PERMISSIONS].sort()).toEqual(Object.keys(PERMISSION_WARNINGS).sort());
  });

  it("never treats a core permission as helper-provided, despite the shape", () => {
    // `crypto:use` looks namespaced. If this regressed, every module declaring a core
    // permission would suddenly be told to add a helper that doesn't exist.
    for (const p of CORE_PERMISSIONS) {
      expect(isCorePermission(p), p).toBe(true);
      expect(helperIdForPermission(p), p).toBeNull();
    }
  });

  it("derives the helper id from the namespace, for helpers core has never heard of", () => {
    expect(helperIdForPermission("filesystem:write")).toBe("filesystem");
    expect(helperIdForPermission("backup:restore")).toBe("backup");
    expect(helperIdForPermission("my-helper:read")).toBe("my-helper");
  });

  it("rejects shapes that aren't a permission at all", () => {
    for (const bad of ["files", "Files:Write", "filesystem:", ":write", "file system:write", "", "a:b:c "]) {
      expect(isValidPermission(bad), bad).toBe(false);
      expect(helperIdForPermission(bad), bad).toBeNull();
    }
    expect(isValidPermission(42)).toBe(false);
    expect(isValidPermission(null)).toBe(false);
  });
});

describe("describePermission", () => {
  it("renders core permissions exactly as before — unchanged wording and styling", () => {
    // Regression guard: the 1.5.1 type widening must not alter what an existing module's
    // consent screen says. These are the strings shipped in 1.4.0.
    expect(describePermission("network:outbound")).toEqual({
      text: "Connect out to other servers (web requests, and raw TCP, DNS, TLS and ping checks)",
      dangerous: false,
    });
    expect(describePermission("audit:write")).toEqual({
      text: "Add entries to your audit log",
      dangerous: false,
    });
    for (const p of CORE_PERMISSIONS) {
      expect(describePermission(p).dangerous, p).toBe(DANGEROUS_PERMISSIONS.has(p as never));
    }
  });

  it("uses the helper's own wording, and flags it dangerous by default", () => {
    const labels = { "filesystem:write": "Read and write files in D:\\Backups" };
    expect(describePermission("filesystem:write", labels)).toEqual({
      text: "Read and write files in D:\\Backups",
      dangerous: true, // core has no opinion about a capability it didn't define
    });
  });

  it("NEVER renders blank for an unlabelled helper capability", () => {
    // The failure this replaced: `PERMISSION_WARNINGS[p]` was undefined for anything
    // outside the taxonomy, so the admin saw an empty bullet — or nothing at all.
    const res = describePermission("filesystem:write");
    expect(res.text).not.toBe("");
    expect(res.text).toContain("filesystem:write");
    expect(res.text).toContain("filesystem"); // names the helper responsible
    expect(res.dangerous).toBe(true);
  });

  it("still describes a malformed permission rather than swallowing it", () => {
    const res = describePermission("nonsense" as never);
    expect(res.text).toContain("nonsense");
    expect(res.dangerous).toBe(true);
  });

  it("does not let a helper label shadow a core permission's wording", () => {
    // A helper cannot rewrite what `crypto:use` means to the admin. The manifest parser
    // refuses such a capability outright, but the resolver must not honour one either.
    const hostile = { "crypto:use": "Completely harmless, ignore this" };
    expect(describePermission("crypto:use", hostile).text).toBe(PERMISSION_WARNINGS["crypto:use"]);
  });
});
