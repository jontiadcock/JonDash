import { describe, it, expect } from "vitest";
import {
  validatePasswordStrength,
  hashPassword,
  verifyPassword,
  verifyDecoyPassword,
} from "@/lib/auth/password";

describe("password strength policy", () => {
  it("requires at least 12 characters", () => {
    expect(validatePasswordStrength("Ab1!aaaa")).toMatch(/12 characters/);
  });

  it("requires 3 of 4 character classes", () => {
    expect(validatePasswordStrength("alllowercaseletters")).toMatch(/three of/);
  });

  it("accepts a strong password", () => {
    expect(validatePasswordStrength("Testpass!2026xyz")).toBeNull();
  });
});

describe("argon2 hashing", () => {
  it("verifies the correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("Testpass!2026xyz");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "Testpass!2026xyz")).toBe(true);
    expect(await verifyPassword(hash, "wrong-password")).toBe(false);
  });
});

describe("decoy verify — account-enumeration defence (BUG-44)", () => {
  it("always reports failure", async () => {
    expect(await verifyDecoyPassword("anything")).toBe(false);
  });

  it("spends comparable argon2 work to a real verify, so an unknown address doesn't fail faster", async () => {
    const real = await hashPassword("Testpass!2026xyz");

    // Warm both paths first: the decoy hash is computed once, lazily, so the
    // very first call would otherwise include a full hash on top of the verify.
    await verifyDecoyPassword("warm-up");
    await verifyPassword(real, "warm-up");

    const startReal = performance.now();
    await verifyPassword(real, "wrong-password");
    const realMs = performance.now() - startReal;

    const startDecoy = performance.now();
    await verifyDecoyPassword("wrong-password");
    const decoyMs = performance.now() - startDecoy;

    // Assert the same order of magnitude, not equality. That is what removes the
    // signal; tight bounds here would only make the suite flaky under CI load.
    expect(decoyMs).toBeGreaterThan(realMs * 0.25);
    expect(decoyMs).toBeLessThan(realMs * 4);
  });
});
