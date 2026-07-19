import { describe, it, expect } from "vitest";
import {
  encryptString,
  decryptString,
  hashToken,
  safeEqual,
  generateToken,
} from "@/lib/crypto";

describe("crypto", () => {
  it("AES-GCM round-trips a string", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const enc = encryptString(secret);
    expect(enc).not.toContain(secret); // ciphertext, not plaintext
    expect(decryptString(enc)).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptString("same")).not.toBe(encryptString("same"));
  });

  it("rejects a tampered ciphertext", () => {
    const enc = encryptString("hello");
    const tampered = Buffer.from(enc, "base64");
    tampered[tampered.length - 1] ^= 0xff; // flip a ciphertext byte
    expect(() => decryptString(tampered.toString("base64"))).toThrow();
  });

  it("hashToken is deterministic and hex", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });

  it("safeEqual compares in constant length", () => {
    expect(safeEqual("token", "token")).toBe(true);
    expect(safeEqual("token", "toker")).toBe(false);
    expect(safeEqual("token", "tokenn")).toBe(false);
  });

  it("generateToken is url-safe and unique", () => {
    const a = generateToken(32);
    const b = generateToken(32);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
