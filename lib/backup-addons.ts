import "server-only";
import { prisma } from "@/lib/db";
import { getAllModules } from "@/lib/modules/registry";
import { getAllHelpers } from "@/lib/helpers/registry";
import { moduleTableName } from "@/lib/modules/migrate";
import { helperTableName } from "@/lib/helpers/migrate";
import type { BackupTableDecl } from "@/lib/modules/types";

/**
 * OPS-16 — a module's and a helper's own SQL tables in a backup.
 *
 * The data travels tagged with the version that produced it, and is written back ONLY when the
 * installed version is identical; anything else is skipped and named in a report.
 *
 * ⚠ Strict equality is the whole design. Core cannot know whether 0.0.7 → 0.0.8 changed a column,
 * and writing rows into a schema that no longer fits them corrupts a module rather than restoring
 * it. Never relax it to "same major" or "installed is newer".
 * REFS decideAddonRestore() below — that rule as a pure, testable decision
 *      lib/modules/types.ts › BackupTableDecl — what an author declares
 *      lib/backup.ts — the only caller  PINS tests/unit/backup-addons.test.ts
 */

/** ⚠ `version` is what makes a dump restorable — REFS decideAddonRestore() below · lib/backup.ts */
export type AddonTableDump = {
  kind: "module" | "helper";
  id: string;
  version: string;
  tables: { name: string; rows: Record<string, unknown>[] }[];
};

/** ⚠ What was skipped and why — a restore must never be silently partial.
 *  REFS lib/backup.ts · app/admin/backup/ui.tsx — where the report is shown */
export type AddonRestoreReport = { skipped: string[]; restored: string[] };

/**
 * Whether a dump may be written back — the OPS-16 rule as a pure decision, separated from the
 * writing so the part that protects data can be tested directly rather than through a database.
 *
 * ⚠ Strict equality: not "same major", not "installed is newer". The cost is asymmetric — refusing
 * costs a re-run after installing the right version; writing costs a corrupted module and a backup
 * the admin already trusted. PINS tests/unit/backup-addons.test.ts
 */
export function decideAddonRestore(
  dump: Pick<AddonTableDump, "kind" | "id" | "version">,
  installedVersion: string | undefined,
): { restore: true } | { restore: false; reason: string } {
  const what = `${dump.kind === "module" ? "Module" : "Shared capability"} “${dump.id}”`;
  if (!installedVersion) {
    return { restore: false, reason: `${what} isn’t installed here, so its stored data was not restored.` };
  }
  if (installedVersion !== dump.version) {
    return {
      restore: false,
      reason:
        `${what} is version ${installedVersion} here but the backup was made on ${dump.version}. ` +
        `Its stored data was left alone — writing it into a different version’s tables could corrupt it. ` +
        `Install ${dump.version} and restore again if you need that data.`,
    };
  }
  return { restore: true };
}

/** REFS lib/modules/migrate.ts › moduleTableName() · lib/helpers/migrate.ts › helperTableName() —
 *  the same naming the migrations used, or the dump addresses a table that does not exist */
function physicalName(kind: "module" | "helper", id: string, logical: string): string {
  return kind === "module" ? moduleTableName(id, logical) : helperTableName(id, logical);
}

/**
 * ⚠ Table names reach a query as IDENTIFIERS, which cannot be parameterised, so they are
 * constructed and never accepted. The naming helpers already reduce anything outside `[a-z0-9]` to
 * `_`; this re-checks the finished string anyway, because the declaration is third-party code and
 * this is the last point before it becomes SQL.
 */
function safeTableName(name: string): boolean {
  return /^(mod|hlp)_[a-z0-9_]+$/.test(name);
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    table,
  );
  return rows.length > 0;
}

/** ⚠ Registry AND database: a definition on disk that is not installed must not be dumped.
 *  REFS lib/modules/registry.ts › getAllModules() · lib/helpers/registry.ts › getAllHelpers() */
async function declaringAddons(): Promise<
  { kind: "module" | "helper"; id: string; version: string; tables: BackupTableDecl[] }[]
> {
  const out: { kind: "module" | "helper"; id: string; version: string; tables: BackupTableDecl[] }[] = [];

  const installedModules = new Set(
    (await prisma.module.findMany({ select: { id: true } })).map((m) => m.id),
  );
  for (const def of getAllModules()) {
    const tables = def.backup?.tables ?? [];
    if (tables.length && installedModules.has(def.id)) {
      out.push({ kind: "module", id: def.id, version: def.version, tables });
    }
  }

  const installedHelpers = new Set(
    (await prisma.helper.findMany({ select: { id: true } })).map((h) => h.id),
  );
  for (const def of getAllHelpers()) {
    const tables = def.backup?.tables ?? [];
    if (tables.length && installedHelpers.has(def.id)) {
      out.push({ kind: "helper", id: def.id, version: def.version, tables });
    }
  }
  return out;
}

/**
 * Read every declared add-on table. ⚠ `includeSecrets` follows the passphrase, exactly as core's
 * own settings do; a secret column in an unencrypted backup is BLANKED rather than dropped, so the
 * row restores with its shape intact and the gap is visible.
 * REFS lib/backup.ts — passes the same flag core uses  PINS tests/unit/backup-addons.test.ts
 */
export async function collectAddonTables(includeSecrets: boolean): Promise<AddonTableDump[]> {
  const dumps: AddonTableDump[] = [];

  for (const addon of await declaringAddons()) {
    const tables: AddonTableDump["tables"] = [];
    for (const decl of addon.tables) {
      const physical = physicalName(addon.kind, addon.id, decl.name);
      if (!safeTableName(physical)) continue;
      // A declared table whose migration never ran is not an error worth failing a backup over.
      if (!(await tableExists(physical))) continue;

      const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM "${physical}"`,
      );
      const secrets = new Set(decl.secret ?? []);
      const cleaned = rows.map((row) => {
        const copy: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
          // ⚠ SQLite integers arrive as BigInt through Prisma's raw path and BigInt is not
          // JSON-serialisable — without this the backup throws while being written.
          const value = typeof v === "bigint" ? Number(v) : v;
          copy[k] = !includeSecrets && secrets.has(k) ? null : value;
        }
        return copy;
      });
      tables.push({ name: decl.name, rows: cleaned });
    }
    if (tables.length) {
      dumps.push({ kind: addon.kind, id: addon.id, version: addon.version, tables });
    }
  }
  return dumps;
}

/**
 * Write add-on tables back, only where the installed version matches the backup's.
 *
 * ⚠ Runs OUTSIDE the main restore transaction: these are third-party schemas addressed by name, and
 * a failure in one add-on's data must not roll back the restore of the app itself. Each table is
 * replaced wholesale in its own transaction, so it is either the backup's or untouched.
 * REFS decideAddonRestore() above · lib/backup.ts  PINS tests/unit/backup-addons.test.ts
 */
export async function restoreAddonTables(dumps: AddonTableDump[]): Promise<AddonRestoreReport> {
  const report: AddonRestoreReport = { skipped: [], restored: [] };
  const modules = new Map(getAllModules().map((d) => [d.id, d.version]));
  const helpers = new Map(getAllHelpers().map((d) => [d.id, d.version]));

  for (const dump of dumps) {
    const installed = dump.kind === "module" ? modules.get(dump.id) : helpers.get(dump.id);
    const what = `${dump.kind === "module" ? "Module" : "Shared capability"} “${dump.id}”`;

    const verdict = decideAddonRestore(dump, installed);
    if (!verdict.restore) {
      report.skipped.push(verdict.reason);
      continue;
    }

    for (const table of dump.tables) {
      const physical = physicalName(dump.kind, dump.id, table.name);
      if (!safeTableName(physical) || !(await tableExists(physical))) {
        report.skipped.push(`${what}: table “${table.name}” doesn’t exist here and was skipped.`);
        continue;
      }
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`DELETE FROM "${physical}"`);
          for (const row of table.rows) {
            const cols = Object.keys(row);
            if (!cols.length) continue;
            const quoted = cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(", ");
            const marks = cols.map(() => "?").join(", ");
            await tx.$executeRawUnsafe(
              `INSERT INTO "${physical}" (${quoted}) VALUES (${marks})`,
              ...cols.map((c) => row[c] as never),
            );
          }
        });
        report.restored.push(`${what}: ${table.rows.length} row(s) into “${table.name}”.`);
      } catch (e) {
        // Named, not swallowed: a table that failed to restore is precisely the thing an admin
        // needs to know about, and the app itself is already restored by this point.
        report.skipped.push(
          `${what}: table “${table.name}” could not be restored (${
            e instanceof Error ? e.message : String(e)
          }).`,
        );
      }
    }
  }
  return report;
}
