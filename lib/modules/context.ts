import "server-only";
import { prisma } from "@/lib/db";
import { encryptString, decryptString } from "@/lib/crypto";
import { audit as coreAudit } from "@/lib/audit";
import { sendMail } from "@/lib/email/send";
import type { ModuleContext, ModuleDefinition, ModulePermission } from "./types";
import { moduleSettingsApi, moduleStoreApi } from "./store";
import { moduleTableName } from "./migrate";
import { pingHost } from "./net";
import { getModuleState } from "./registry";

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
  if (has("network:outbound")) {
    ctx.fetch = fetch;
    ctx.net = { ping: (host, opts) => pingHost(host, opts ?? {}) };
  }
  if (has("email:send")) {
    ctx.email = {
      send: async (msg) => {
        // sendMail never throws; surface a failure so a module can't silently not send.
        const res = await sendMail(msg);
        if (!res.ok) throw new Error(`Email not sent: ${res.error}`);
      },
    };
  }
  if (has("audit:write")) {
    ctx.audit = async (action, detail) => {
      await coreAudit(`module.${def.id}.${action}`, { userId: user?.id, detail });
    };
  }
  // Elevated capabilities (user accounts, core tables, sessions, files) aren't built yet.
  // Their permissions were removed from the taxonomy rather than left declared-but-inert;
  // each returns with the capability that implements it.

  return ctx;
}

/**
 * A ctx for a module's BACKGROUND work (pollers, schedulers, cron-ish loops), where
 * there is no signed-in user. Use this instead of holding on to a context captured from
 * a request: that misattributes every later audit entry to whichever user happened to
 * trigger the first one. Permissions still come from what the admin granted.
 */
export async function systemModuleContext(moduleId: string): Promise<ModuleContext> {
  const state = await getModuleState(moduleId);
  if (!state) throw new Error(`Unknown module "${moduleId}".`);
  if (!state.enabled) throw new Error(`Module "${moduleId}" is not enabled.`);
  return buildModuleContext(state.def, state.granted, null);
}
