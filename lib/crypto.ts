import "server-only";
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { getEncryptionKey } from "@/lib/config";

const IV_LENGTH = 12; // GCM standard nonce length
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt a UTF-8 string with AES-256-GCM. Output is base64 `iv || authTag || ciphertext`.
 *
 * ⚠ The output layout is a STORED format — changing the order or the lengths above makes every
 * existing secret undecryptable, so it needs a migration, not an edit.
 * ⚠ The key comes from `.data/secrets.json`, which the backup carries; losing it loses every TOTP
 * secret and encrypted setting. REFS lib/config.ts › getEncryptionKey() · lib/backup.ts
 *      lib/auth/totp.ts · lib/email/config.ts · lib/settings.ts · lib/modules/store.ts — the users
 * PINS tests/unit/crypto.test.ts
 */
export function encryptString(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/** ⚠ Throws on a wrong key or tampered payload rather than returning garbage — that is the GCM
 *  auth tag doing its job, so never catch-and-default around it.
 *  REFS lib/config.ts › getEncryptionKey()  PINS tests/unit/crypto.test.ts */
export function decryptString(payload: string): string {
  const data = Buffer.from(payload, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** A URL-safe random token — the raw secret handed to the client, stored only as a hash.
 *  REFS hashToken() below — always pair them · lib/auth/session.ts · app/admin/actions.ts
 *  PINS tests/unit/crypto.test.ts */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Hash a token for storage. ⚠ SHA-256 is right ONLY for high-entropy tokens from
 *  `generateToken` — never for a password, which needs argon2.
 *  REFS lib/auth/password.ts — the password path · lib/auth/session.ts · lib/auth/backup-codes.ts ·
 *       app/setup/[token]/actions.ts  PINS tests/unit/crypto.test.ts */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison. ⚠ Returns false on a length mismatch, which leaks length — fine for
 *  fixed-length hashes, wrong for anything variable. PINS tests/unit/crypto.test.ts */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
