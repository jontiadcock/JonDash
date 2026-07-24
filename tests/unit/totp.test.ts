import { describe, it, expect, afterAll } from "vitest";
import { authenticator } from "otplib";
import { prisma } from "@/lib/db";
import {
  generateTotpSecret,
  verifyTotp,
  encryptTotpSecret,
  verifyTotpEncrypted,
  verifyTotpStep,
  totpStepAt,
  consumeTotpForUser,
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

// BUG-51: a code stays mathematically valid for its whole 30s step plus the drift
// window, so verifying alone let the same six digits sign in more than once —
// proven in the field. RFC 6238 §5.2 wants a validated OTP accepted exactly once.

const EMAIL = "bug51-replay@test.local";

async function makeUser(secret: string) {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  return prisma.user.create({
    data: {
      email: EMAIL,
      role: "USER",
      status: "ACTIVE",
      totpSecretEnc: encryptTotpSecret(secret),
      mfaEnabled: true,
    },
  });
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
});

describe("TOTP replay protection (BUG-51)", () => {
  it("reports which timestep a code matched, not just that it matched", () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotpStep(code, secret)).toBe(totpStepAt());
    expect(verifyTotpStep("000000", secret)).toBeNull();
    expect(verifyTotpStep("not-a-code", secret)).toBeNull();
  });

  it("accepts a code once, then refuses those same digits", async () => {
    const secret = generateTotpSecret();
    const user = await makeUser(secret);
    const code = authenticator.generate(secret);

    expect(await consumeTotpForUser(user, code)).toBe(true);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.totpLastStep).toBe(totpStepAt());

    // Still inside its validity window, so it would verify — but must not authenticate.
    expect(await consumeTotpForUser(after, code)).toBe(false);
  });

  it("still accepts a code from a later timestep than the one consumed", async () => {
    const secret = generateTotpSecret();
    const user = await makeUser(secret);
    const code = authenticator.generate(secret);
    expect(await consumeTotpForUser(user, code)).toBe(true);

    // Rewind the recorded step, as though the clock had since moved on.
    const stale = await prisma.user.update({
      where: { id: user.id },
      data: { totpLastStep: totpStepAt() - 5 },
    });
    expect(await consumeTotpForUser(stale, code)).toBe(true);
  });

  it("lets only one of two concurrent uses through", async () => {
    const secret = generateTotpSecret();
    const user = await makeUser(secret);
    const code = authenticator.generate(secret);

    // Both callers hold the same pre-consumption snapshot, as two racing requests
    // would. A read-then-write would let both in; the guard is in the UPDATE.
    const results = await Promise.all([
      consumeTotpForUser(user, code),
      consumeTotpForUser(user, code),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
