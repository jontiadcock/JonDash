/**
 * Seeds the first ADMIN account. The admin is created in PENDING_SETUP state
 * and a one-time setup link is printed — visit it to set a password and enrol
 * TOTP through the normal flow (no plaintext password is ever stored here).
 *
 * Run with:  npm run db:seed
 * Optionally set SEED_ADMIN_EMAIL to control the address.
 */
import { PrismaClient } from "../lib/generated/prisma/index.js";
import { createHash, randomBytes } from "node:crypto";

const prisma = new PrismaClient();

const SETUP_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User ${email} already exists (status: ${existing.status}). No changes made.`);
    return;
  }

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  await prisma.user.create({
    data: {
      email,
      role: "ADMIN",
      status: "PENDING_SETUP",
      setupTokenHash: tokenHash,
      setupTokenExpiresAt: new Date(Date.now() + SETUP_TOKEN_TTL_MS),
    },
  });

  console.log("\n✅ Admin account created.");
  console.log(`   Email: ${email}`);
  console.log("\n🔗 Complete setup at:");
  console.log(`   ${appUrl}/setup/${rawToken}\n`);
  console.log("   (This link expires in 7 days.)\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
