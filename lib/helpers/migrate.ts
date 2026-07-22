import "server-only";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import type { HelperDefinition } from "./types";

/**
 * Raw-SQL migrations for a helper's OWN tables (MOD-08) — the module runner's twin, with
 * a distinct `hlp_` prefix so a helper and a module of the same name can never collide.
 *
 * Applied at boot, before `onBoot` runs: a helper that gained a table in an update must
 * never run against the old layout. That is the exact failure modules hit before
 * `ensureModuleMigrations` existed, and it's cheaper to not repeat it.
 *
 * Migration bookkeeping reuses the `ModuleMigration` table with the helper id namespaced,
 * rather than adding a near-identical table.
 */

const HELPERS_DIR = path.join(process.cwd(), "helpers");

/** Namespaced physical table name for a helper's logical table. */
export function helperTableName(helperId: string, name: string): string {
  const safe = (s: string) => s.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  return `hlp_${safe(helperId)}_${safe(name)}`;
}

/** Bookkeeping key — namespaced so it can't clash with a module of the same id. */
function migrationOwner(helperId: string): string {
  return `helper:${helperId}`;
}

function splitStatements(sql: string): string[] {
  const cleaned = sql.replace(/^\s*--.*$/gm, "");
  return cleaned
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Apply any not-yet-applied SQL migrations for a helper (files sorted by name). */
export async function runHelperMigrations(def: HelperDefinition): Promise<void> {
  if (!def.migrations) return;
  const dir = path.join(HELPERS_DIR, def.id, def.migrations.replace(/^\.\//, ""));
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  } catch {
    return; // no migrations dir
  }

  const owner = migrationOwner(def.id);
  const applied = new Set(
    (await prisma.moduleMigration.findMany({ where: { moduleId: owner }, select: { filename: true } })).map(
      (m) => m.filename,
    ),
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    for (const stmt of splitStatements(sql)) {
      await prisma.$executeRawUnsafe(stmt);
    }
    await prisma.moduleMigration.create({ data: { moduleId: owner, filename: file } });
  }
}

/**
 * Drop a helper's tables. Deliberately NOT called when a helper is removed: a helper can
 * own real data (a scheduler's jobs), and destroying it because the last dependent module
 * happened to be uninstalled is the same class of mistake that has already cost this
 * project a bricked install. Removal takes the files; the data stays.
 */
export async function dropHelperTables(helperId: string): Promise<void> {
  const prefix = helperTableName(helperId, "");
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='table'`,
  );
  for (const r of rows.filter((r) => r.name.startsWith(prefix))) {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${r.name}"`);
  }
  await prisma.moduleMigration.deleteMany({ where: { moduleId: migrationOwner(helperId) } });
}
