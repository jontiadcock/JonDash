import "server-only";
import { assertSameOrigin } from "@/lib/security/csrf";
import { requireUser, requireAdmin } from "@/lib/auth/guards";
import type { ModuleContext } from "./types";
import { buildModuleContext } from "./context";
import { getModuleState } from "./registry";

/**
 * The sanctioned way for a module to perform a MUTATION from its own UI (MOD-01 Phase 3).
 * Without this, modules are read-only: they can render, but nothing they show can have a
 * working button.
 *
 * Wrap the handler and export it from a `"use server"` file inside the module:
 *
 *   "use server";
 *   import { moduleAction } from "@/lib/modules/actions";
 *   export const saveThing = moduleAction("health-monitor", async (ctx, fd: FormData) => { … });
 *
 * Every call is checked before the handler runs — the module must be installed AND
 * enabled, the caller must be signed in (a full admin when the module is `adminOnly`),
 * and the ctx exposes only the permissions the admin actually granted. It THROWS on any
 * of those failures rather than returning a falsy value, so a failure can't be mistaken
 * for a no-op. Next runs its Server Action origin check too; the explicit same-origin
 * assertion here matches the rest of the app's actions and keeps the guarantee local.
 */
export function moduleAction<Args extends unknown[], R>(
  moduleId: string,
  handler: (ctx: ModuleContext, ...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
  return async (...args: Args): Promise<R> => {
    await assertSameOrigin();

    const state = await getModuleState(moduleId);
    if (!state) throw new Error(`Unknown module "${moduleId}".`);
    if (!state.enabled) throw new Error(`Module "${moduleId}" is not enabled.`);

    // adminOnly modules are full-admin only; everything else needs a signed-in user.
    const user = state.def.adminOnly ? await requireAdmin() : await requireUser();

    const ctx = buildModuleContext(state.def, state.granted, {
      id: user.id,
      email: user.email,
      role: user.role as "ADMIN" | "USER",
    });
    return handler(ctx, ...args);
  };
}
