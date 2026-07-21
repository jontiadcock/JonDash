import "server-only";
import { prisma } from "@/lib/db";
import { encryptString, decryptString } from "@/lib/crypto";
import { audit as coreAudit } from "@/lib/audit";
import type { ModuleContext, ModuleDefinition, ModulePermission } from "./types";
import { moduleSettingsApi, moduleStoreApi } from "./store";
import { moduleTableName } from "./migrate";

/**
 * Build the capability-scoped ModuleContext handed to a module's hooks / components
 * (MOD-01). Only the capabilities the module was granted are exposed — the module can
 * never reach a capability it didn't declare and the admin didn't approve.
 *
 * Honest limit: modules run in-process, so this is defense-in-depth for CURATED
 * modules, not a hard sandbox (see jondash-module-framework / MODULES-AUTHORING).
 */
export function buildModuleContext(
  def: ModuleDefinition,
  granted: ModulePermission[],
  user: ModuleContext["user"],
): ModuleContext {
  const has = (p: ModulePermission) => granted.includes(p);

  const ctx: ModuleContext = {
    moduleId: def.id,
    user,
    settings: moduleSettingsApi(def),
    store: moduleStoreApi(def.id),
  };

  // Baseline: a module that ships migrations owns `mod_<id>_*` tables via scoped raw SQL.
  if (def.migrations) {
    ctx.db = {
      table: (name) => moduleTableName(def.id, name),
      query: <T = unknown,>(sql: string, ...params: unknown[]) =>
        prisma.$queryRawUnsafe<T[]>(sql, ...params),
      run: async (sql: string, ...params: unknown[]) => {
        await prisma.$executeRawUnsafe(sql, ...params);
      },
    };
  }

  if (has("crypto:use")) ctx.crypto = { encrypt: encryptString, decrypt: decryptString };
  if (has("network:outbound")) ctx.fetch = fetch;
  if (has("audit:write")) {
    ctx.audit = async (action, detail) => {
      await coreAudit(`module.${def.id}.${action}`, { userId: user?.id, detail });
    };
  }
  // usersDb (db:users:*) and other elevated caps are wired in a later phase.

  return ctx;
}
