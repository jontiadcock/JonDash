import "server-only";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import type { HelperDefinition } from "./types";

/*
 * Raw-SQL migrations for a helper's OWN tables — the module runner's twin, with a distinct `hlp_`
 * prefix so a helper and a module of the same name can never collide.
 *
 * ⚠ Applied at boot **before `onBoot`**: a helper that gained a table in an update must never run
 *   against the old layout. Bookkeeping reuses `ModuleMigration` with the helper id namespaced.
 * REFS lib/helpers/boot.ts — the caller · lib/modules/migrate.ts — the module twin
 *      lib/modules/manage.ts › ensureModuleMigrations() — the failure this mirrors
 */

const HELPERS_DIR = path.join(process.cwd(), "helpers");

/** Namespaced physical table name for a helper's logical table. */
/** REFS lib/backup-addons.ts · lib/helpers/boot.ts · lib/helpers/types.ts › backup */
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
/** REFS lib/helpers/boot.ts — the only caller; runs before onBoot. */
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
 * ⚠ **Deliberately NOT called when a helper is removed.** A helper can own real data, and
 *   destroying it because the last dependent module happened to be uninstalled is how an install
 *   gets bricked. Removal takes the files; the data stays.
 * REFS lib/helpers/install.ts › removeHelperFiles() — what removal actually does
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
