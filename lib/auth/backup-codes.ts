import "server-only";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/crypto";

// One-time 2FA recovery codes. Ten codes per set. Each is high-entropy and
// single-use; only the SHA-256 hash is stored (raw shown to the user once).

export const BACKUP_CODE_COUNT = 10;

// Unambiguous alphabet (no 0/O/1/I/l) so codes are easy to read/type.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const GROUP = 5; // characters per group
const GROUPS = 2; // -> 10 chars, ~49 bits of entropy

function randomCodeRaw(): string {
  let out = "";
  for (let g = 0; g < GROUPS; g++) {
    if (g > 0) out += "-";
    for (let i = 0; i < GROUP; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out; // e.g. "A7K2M-9QRZ4"
}

/** Normalize user-entered codes: strip spaces/dashes, uppercase. */
export function normalizeBackupCode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

function hashOf(raw: string): string {
  return hashToken(normalizeBackupCode(raw));
}

/**
 * Replace a user's backup codes with a fresh set. Returns the raw codes to
 * display ONCE — they cannot be retrieved again.
 */
export async function generateBackupCodes(userId: string): Promise<string[]> {
  const codes = new Set<string>();
  while (codes.size < BACKUP_CODE_COUNT) codes.add(randomCodeRaw());
  const raw = [...codes];

  await prisma.$transaction([
    prisma.backupCode.deleteMany({ where: { userId } }),
    prisma.backupCode.createMany({
      data: raw.map((code) => ({ userId, codeHash: hashOf(code) })),
    }),
  ]);

  return raw;
}

/** How many codes remain unused, and the total in the current set. */
export async function backupCodeStatus(
  userId: string,
): Promise<{ remaining: number; total: number }> {
  const [remaining, total] = await Promise.all([
    prisma.backupCode.count({ where: { userId, usedAt: null } }),
    prisma.backupCode.count({ where: { userId } }),
  ]);
  return { remaining, total };
}

/**
 * Atomically consume a matching unused backup code. Returns true if a code was
 * consumed. The updateMany guard makes double-use impossible under races.
 */
export async function consumeBackupCode(userId: string, raw: string): Promise<boolean> {
  const normalized = normalizeBackupCode(raw);
  if (normalized.length < GROUP * GROUPS) return false;
  const res = await prisma.backupCode.updateMany({
    where: { userId, codeHash: hashToken(normalized), usedAt: null },
    data: { usedAt: new Date() },
  });
  return res.count > 0;
}
