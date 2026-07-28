import "server-only";
import { prisma } from "@/lib/db";
import { getAllModules } from "@/lib/modules/registry";
import { getAllHelpers } from "@/lib/helpers/registry";
import { moduleTableName } from "@/lib/modules/migrate";
import { helperTableName } from "@/lib/helpers/migrate";
import type { BackupTableDecl } from "@/lib/modules/types";

/**
 * OPS-16 — a module's and a helper's **own SQL tables** in a backup.
 *
 * Until now a backup carried a module's settings and stored records but not the tables its
 * migrations created, and said so in a comment: writing rows from one version into a schema built
 * by another is how you corrupt a module rather than restore it. That reasoning was right and the
 * conclusion — omit them entirely — was too blunt: restoring left a health monitor with its checks
 * configured and no history, and an install that *is* on the same version had nothing wrong with it.
 *
 * So the data travels, **tagged with the version that produced it**, and is written back only when
 * the installed version is the same. Anything else is skipped and named in a report. The rule is
 * strict equality, deliberately: core cannot know whether 0.0.7 → 0.0.8 changed a column, and
 * guessing wrong writes rows into a schema that no longer fits them.
 */

export type AddonTableDump = {
  kind: "module" | "helper";
  id: string;
  version: string;
  tables: { name: string; rows: Record<string, unknown>[] }[];
};

/** What was skipped and why, so a restore is never silently partial. */
export type AddonRestoreReport = { skipped: string[]; restored: string[] };

/**
 * Whether a dump may be written back — the whole rule of OPS-16, as a pure decision.
 *
 * Separated from the writing so it can be tested for what it *is* rather than through a database:
 * the decision is the part that protects data, and "strict equality, and say why when it isn't"
 * is a claim worth pinning directly.
 *
 * **Strict equality is deliberate.** Not "same major", not "installed is newer" — core has no way
 * to know whether 0.0.7 → 0.0.8 renamed a column, and an add-on author has no way to tell it. The
 * cost of being wrong is asymmetric: refusing costs the admin a re-run after installing the right
 * version, while writing costs them a corrupted module and a backup they already trusted.
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

/** Physical table name for a declaration, by kind. */
function physicalName(kind: "module" | "helper", id: string, logical: string): string {
  return kind === "module" ? moduleTableName(id, logical) : helperTableName(id, logical);
}

/**
 * Table names reach a query as identifiers, which cannot be parameterised — so they are
 * **constructed, never accepted**. `moduleTableName`/`helperTableName` already reduce anything
 * outside `[a-z0-9]` to `_`, and this re-checks the finished string rather than trusting that,
 * because the declaration comes from third-party code and this is the last point before it becomes
 * SQL.
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

/** Every installed add-on that declares tables, paired with its installed version. */
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
 * Read every declared add-on table.
 *
 * `includeSecrets` follows the passphrase, exactly as core's own settings do. A secret column in an
 * unencrypted backup is blanked rather than dropped, so the row still restores with its shape
 * intact and the gap is visible.
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
          // BigInt is not JSON-serialisable, and SQLite integers arrive as BigInt through
          // Prisma's raw path. Numbers survive the round trip; the alternative is a backup that
          // throws while being written.
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
 * Write add-on tables back, **only where the installed version matches the backup's**.
 *
 * Runs outside the main restore transaction on purpose: these are third-party schemas addressed by
 * name, and a failure in one add-on's data must not roll back the restore of the app itself. Each
 * table is replaced wholesale inside its own transaction, so a table is either the backup's or
 * untouched — never half of each.
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
