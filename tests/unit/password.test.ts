import { describe, it, expect } from "vitest";
import {
  validatePasswordStrength,
  hashPassword,
  verifyPassword,
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
