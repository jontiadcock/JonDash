import "server-only";
import { prisma } from "@/lib/db";
import { encryptString, decryptString } from "@/lib/crypto";
import type { ModuleSettingsApi, ModuleStoreApi, ModuleDefinition } from "./types";

/**
 * Module data storage (MOD-01). Settings live in the shared Setting table under
 * `scope="module"`, `ownerId=<moduleId>`; the generic key/value store lives in the
 * ModuleRecord table. Secret values are encrypted at rest via lib/crypto — the same
 * key + posture as the rest of the app. Everything here is removed on uninstall
 * (see purgeModuleData) so a module leaves no trace.
 */

const MODULE_SCOPE = "module";

function decode(valueJson: string, secret: boolean, fallback: unknown = null): unknown {
  try {
    return JSON.parse(secret ? decryptString(valueJson) : valueJson);
  } catch {
    return fallback;
  }
}

/** A module's declared settings (auto-form + programmatic access). */
export function moduleSettingsApi(def: ModuleDefinition): ModuleSettingsApi {
  const fields = def.settings ?? [];
  const secretKeys = new Set(fields.filter((f) => f.secret).map((f) => f.key));
  const defaults = new Map(fields.map((f) => [f.key, f.default ?? null]));

  return {
    async get(key) {
      const row = await prisma.setting.findUnique({
        where: { scope_ownerId_key: { scope: MODULE_SCOPE, ownerId: def.id, key } },
      });
      if (!row) return defaults.get(key) ?? null;
      return decode(row.valueJson, row.secret, defaults.get(key) ?? null);
    },
    async set(key, value) {
      const secret = secretKeys.has(key);
      const stored = secret ? encryptString(JSON.stringify(value)) : JSON.stringify(value);
      await prisma.setting.upsert({
        where: { scope_ownerId_key: { scope: MODULE_SCOPE, ownerId: def.id, key } },
        create: { scope: MODULE_SCOPE, ownerId: def.id, key, valueJson: stored, secret },
        update: { valueJson: stored, secret },
      });
    },
    async all() {
      const out: Record<string, unknown> = {};
      for (const f of fields) out[f.key] = f.default ?? null;
      const rows = await prisma.setting.findMany({ where: { scope: MODULE_SCOPE, ownerId: def.id } });
      for (const row of rows) out[row.key] = decode(row.valueJson, row.secret);
      return out;
    },
  };
}

/** A module's generic key/value store (no migration needed). */
export function moduleStoreApi(moduleId: string): ModuleStoreApi {
  return {
    async get(key) {
      const row = await prisma.moduleRecord.findUnique({ where: { moduleId_key: { moduleId, key } } });
      return row ? decode(row.valueJson, row.secret) : null;
    },
    async set(key, value, opts) {
      const secret = !!opts?.secret;
      const stored = secret ? encryptString(JSON.stringify(value)) : JSON.stringify(value);
      await prisma.moduleRecord.upsert({
        where: { moduleId_key: { moduleId, key } },
        create: { moduleId, key, valueJson: stored, secret },
        update: { valueJson: stored, secret },
      });
    },
    async delete(key) {
      await prisma.moduleRecord.deleteMany({ where: { moduleId, key } });
    },
    async list(prefix) {
      const rows = await prisma.moduleRecord.findMany({
        where: { moduleId, ...(prefix ? { key: { startsWith: prefix } } : {}) },
        orderBy: { key: "asc" },
      });
      return rows.map((r) => ({ key: r.key, value: decode(r.valueJson, r.secret) }));
    },
  };
}

/** Remove a module's settings + generic store rows (called on uninstall). */
export async function purgeModuleData(moduleId: string): Promise<void> {
  await prisma.setting.deleteMany({ where: { scope: MODULE_SCOPE, ownerId: moduleId } });
  await prisma.moduleRecord.deleteMany({ where: { moduleId } });
}
