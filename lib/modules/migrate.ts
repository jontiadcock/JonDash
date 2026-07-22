import "server-only";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import type { ModuleDefinition } from "./types";

/**
 * Raw-SQL migration runner for a module's OWN tables (MOD-01). A module carries
 * `migrations/NNN_name.sql` files that create tables namespaced `mod_<id>_*`; this
 * applies unapplied ones (tracked in ModuleMigration) at enable/update, and drops
 * every `mod_<id>_*` table on uninstall. Kept separate from the core Prisma schema so
 * modules own their schema and can update independently of the base app.
 */

const MODULES_DIR = path.join(process.cwd(), "modules");

/** Namespaced physical table name for a module's logical table. */
export function moduleTableName(moduleId: string, name: string): string {
  const safe = (s: string) => s.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  return `mod_${safe(moduleId)}_${safe(name)}`;
}

function splitStatements(sql: string): string[] {
  // Strip line comments, then split on ";" at end-of-statement.
  const cleaned = sql.replace(/^\s*--.*$/gm, "");
  return cleaned
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Apply any not-yet-applied SQL migrations for a module (files sorted by name). */
export async function runModuleMigrations(def: ModuleDefinition): Promise<void> {
  if (!def.migrations) return;
  const dir = path.join(MODULES_DIR, def.id, def.migrations.replace(/^\.\//, ""));
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  } catch {
    return; // no migrations dir
  }
  const applied = new Set(
    (await prisma.moduleMigration.findMany({ where: { moduleId: def.id }, select: { filename: true } })).map(
      (m) => m.filename,
    ),
  );
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    for (const stmt of splitStatements(sql)) {
      await prisma.$executeRawUnsafe(stmt);
    }
    await prisma.moduleMigration.create({ data: { moduleId: def.id, filename: file } });
  }
}

/** Drop all of a module's `mod_<id>_*` tables + its migration records (uninstall). */
export async function dropModuleTables(moduleId: string): Promise<void> {
  const prefix = moduleTableName(moduleId, ""); // "mod_<id>_"
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?`,
    `${prefix}%`,
  );
  for (const r of rows) {
    // r.name comes from sqlite_master and matches our own prefix — safe to inline.
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${r.name}"`);
  }
  await prisma.moduleMigration.deleteMany({ where: { moduleId } });
}
