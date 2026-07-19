import { describe, it, expect } from "vitest";
import { authenticator } from "otplib";
import {
  generateTotpSecret,
  verifyTotp,
  encryptTotpSecret,
  verifyTotpEncrypted,
} from "@/lib/auth/totp";

describe("TOTP", () => {
  it("verifies a current code and rejects a wrong one", () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotp(code, secret)).toBe(true);
    expect(verifyTotp("000000", secret)).toBe(false);
    expect(verifyTotp("not-a-code", secret)).toBe(false);
  });

  it("verifies against an encrypted-at-rest secret", () => {
    const secret = generateTotpSecret();
    const enc = encryptTotpSecret(secret);
    expect(enc).not.toBe(secret);
    const code = authenticator.generate(secret);
    expect(verifyTotpEncrypted(code, enc)).toBe(true);
    expect(verifyTotpEncrypted("000000", enc)).toBe(false);
  });
});
