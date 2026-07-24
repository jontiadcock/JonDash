import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Prisma resolves "file:./vitest.db" relative to prisma/schema.prisma.
const DB_FILE = path.resolve(process.cwd(), "prisma", "vitest.db");
const DB_URL = "file:./vitest.db";

function removeDb() {
  for (const f of [DB_FILE, `${DB_FILE}-journal`]) {
    try {
      fs.rmSync(f, { force: true });
    } catch {
      /* ignore */
    }
  }
}

/** Create a fresh, migrated SQLite DB before the suite; delete it after. */
export default function setup() {
  removeDb();
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: DB_URL },
  });
  return () => {
    removeDb();
  };
}
