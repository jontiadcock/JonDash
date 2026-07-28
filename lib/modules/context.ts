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
 * Build the capability-scoped ModuleContext handed to a module's hooks / components
 * (MOD-01). Only the capabilities the module was granted are exposed — the module can
 * never reach a capability it didn't declare and the admin didn't approve.
 *
 * Honest limit: modules run in-process, so this is defense-in-depth for CURATED
 * modules, not a hard sandbox (see jondash-module-framework / MODULES-AUTHORING).
 */
export function buildModuleContext(
  def: ModuleDefinition,
  granted: DeclaredPermission[],
  user: ModuleContext["user"],
): ModuleContext {
  // De-duped and frozen so a module can't widen its grants by pushing onto the array.
  // NOTE this stops mutation, not substitution: the module hands this object to a helper
  // and can hand a lookalike instead (`{...ctx, can: () => true}`), which a spread builds
  // fresh regardless of what is frozen here. See ModuleContext.grants — advisory, not a
  // boundary, and MOD-11 for the shape that would be one.
  const grants: readonly DeclaredPermission[] = Object.freeze([...new Set(granted)]);
  const has = (p: DeclaredPermission) => grants.includes(p);

  const ctx: ModuleContext = {
    moduleId: def.id,
    user,
    // Helper APIs are imported directly rather than handed over on this object, so a
    // helper has nothing to check a caller against unless we tell it (MOD-10).
    grants,
    can: has,
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
        /*
         * Core owns the chrome; the module supplies the body (1.8.0).
         *
         * A module that passes raw `html` bypasses the shell deliberately — the escape hatch is
         * documented as making Outlook and looking-like-JonDash its own problem. Everything else
         * goes through the branded template, which ESCAPES the body: markup in a module's text
         * arrives as visible text, so a module cannot forge JonDash's own mail.
         */
        let payload: { to: string; subject: string; text?: string; html?: string };

        if (msg.html) {
          payload = { to: msg.to, subject: msg.subject, text: msg.text, html: msg.html };
        } else {
          const { renderBrandedEmail, currentBrand } = await import("@/lib/email/template");
          const { resolveAppUrl } = await import("@/lib/app-url");
          const brand = await currentBrand();

          /*
           * A CTA is dropped, not guessed at, when there is no canonical URL configured.
           *
           * A module can't know the install's external address, and neither can core without
           * being told: deriving it from the request's Host header is forgeable (BUG-41), and a
           * forged header putting an attacker's link into mail JonDash sends is a good deal worse
           * than the same bug on a settings page. No configured base URL means no button — the
           * message still says everything it was going to say.
           */
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

        // sendMail never throws; surface a failure so a module can't silently not send.
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
