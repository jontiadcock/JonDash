import "server-only";
import { prisma } from "@/lib/db";
import { encryptString, decryptString } from "@/lib/crypto";
import { audit as coreAudit } from "@/lib/audit";
import { sendMail } from "@/lib/email/send";
import type { DeclaredPermission, ModuleContext, ModuleDefinition } from "./types";
import { moduleSettingsApi, moduleStoreApi } from "./store";
import { moduleTableName } from "./migrate";
import { pingHost } from "./net";
import { getModuleState } from "./registry";

/**
 * The ModuleContext handed to a module's hooks and components (MOD-01). A capability is present
 * only if granted. ⚠ Modules run in-process: defence-in-depth for curated modules, not a sandbox.
 *
 * REFS lib/modules/types.ts › ModuleContext — the shape every field below must match
 *      callers: app/(app)/dashboard/page.tsx · app/(app)/m/[module]/[[...path]]/page.tsx ·
 *      app/admin/modules/[id]/page.tsx · lib/modules/actions.ts · lib/modules/manage.ts
 * PINS tests/integration/modules.test.ts
 */
export function buildModuleContext(
  def: ModuleDefinition,
  granted: DeclaredPermission[],
  user: ModuleContext["user"],
): ModuleContext {
  // ⚠ Stops mutation, not substitution — a module can hand a helper a lookalike object instead.
  // Advisory, not a boundary. REFS lib/modules/types.ts › ModuleContext.grants · MOD-11
  const grants: readonly DeclaredPermission[] = Object.freeze([...new Set(granted)]);
  const has = (p: DeclaredPermission) => grants.includes(p);

  const ctx: ModuleContext = {
    moduleId: def.id,
    user,
    // Helper APIs are imported directly, not handed over here, so a helper has nothing to check a
    // caller against unless told (MOD-10). REFS lib/helpers/types.ts › HelperCapability.permission
    grants,
    can: has,
    settings: moduleSettingsApi(def),
    store: moduleStoreApi(def.id),
  };

  // Scoped raw SQL over the module's own `mod_<id>_*` tables only.
  // REFS lib/modules/migrate.ts › moduleTableName() — the only namer · lib/backup-addons.ts
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
        // Raw `html` bypasses the shell deliberately; everything else is ESCAPED, so a module
        // cannot forge JonDash's mail. REFS lib/email/template.ts › renderBrandedEmail()
        let payload: { to: string; subject: string; text?: string; html?: string };

        if (msg.html) {
          payload = { to: msg.to, subject: msg.subject, text: msg.text, html: msg.html };
        } else {
          const { renderBrandedEmail, currentBrand } = await import("@/lib/email/template");
          const { resolveAppUrl } = await import("@/lib/app-url");
          const brand = await currentBrand();

          // No base URL means no button. ⚠ Never derive one from the request Host — forgeable,
          // and a forged link in mail beats one on a page (BUG-41). REFS lib/app-url.ts › resolveAppUrl()
          const url = msg.cta ? await resolveAppUrl(msg.cta.path) : null;

          const body = renderBrandedEmail({
            appName: brand.appName,
            accent: brand.accent,
            title: msg.title ?? msg.subject,
            text: msg.text ?? "",
            lists: msg.lists,
            cta: msg.cta && url ? { label: msg.cta.label, url } : undefined,
            footer: `Sent by the ${def.name} add-on in ${brand.appName}.`,
          });
          payload = { to: msg.to, subject: msg.subject, text: body.text, html: body.html };
        }

        // ⚠ sendMail never throws — without this check a module would silently not send.
        // REFS lib/email/send.ts › sendMail()
        const res = await sendMail(payload);
        if (!res.ok) throw new Error(`Email not sent: ${res.error}`);
      },
    };
  }
  if (has("audit:write")) {
    ctx.audit = async (action, detail) => {
      await coreAudit(`module.${def.id}.${action}`, { userId: user?.id, detail });
    };
  }
  // Elevated capabilities (user accounts, core tables, sessions, files) are not built; their
  // permissions were deleted, not left inert. REFS lib/modules/types.ts › ModulePermission

  return ctx;
}

/**
 * A context for background work, where there is no signed-in user. ⚠ Use this rather than holding a
 * context captured from a request — that misattributes every later audit entry to whoever triggered
 * the first one.
 *
 * REFS lib/modules/api.ts — the only caller · lib/modules/registry.ts › getModuleState() — grants
 */
export async function systemModuleContext(moduleId: string): Promise<ModuleContext> {
  const state = await getModuleState(moduleId);
  if (!state) throw new Error(`Unknown module "${moduleId}".`);
  if (!state.enabled) throw new Error(`Module "${moduleId}" is not enabled.`);
  return buildModuleContext(state.def, state.granted, null);
}
