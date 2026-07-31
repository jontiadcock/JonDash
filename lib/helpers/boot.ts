import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getAllHelpers, allRequiredHelperIds, activeHelperIds } from "./registry";
import { helperTableName, runHelperMigrations } from "./migrate";
import type { HelperBootContext, HelperDefinition } from "./types";

/*
 * Helper boot phase (MOD-08). Runs ONCE per server instance, before any request — which is the
 * whole reason helpers exist as a concept: a scheduler that only starts when someone renders a page
 * is not a scheduler.
 *
 * ⚠ **Register intent, do not do work** — everything here delays the server becoming ready.
 * ⚠ **A helper must never stop the server booting.** Each is isolated: a throw is logged and the
 *   others carry on. A monitoring helper must not be why the dashboard will not start.
 * REFS instrumentation.ts — the caller · lib/helpers/types.ts › onBoot — the contract this enforces
 */

const BOOT_BUDGET_MS = 5000;

let booted = false;

/** Shared by `onBoot` and `onUninstall` — both are the system acting, with no user. */
/** REFS lib/helpers/install.ts — builds one for `onUninstall`. */
export function helperContext(def: HelperDefinition): HelperBootContext {
  return bootContext(def);
}

function bootContext(def: HelperDefinition): HelperBootContext {
  return {
    helperId: def.id,
    ...(def.migrations
      ? {
          db: {
            table: (name: string) => helperTableName(def.id, name),
            query: <T = unknown,>(sql: string, ...params: unknown[]) => prisma.$queryRawUnsafe<T[]>(sql, ...params),
            run: async (sql: string, ...params: unknown[]) => {
              await prisma.$executeRawUnsafe(sql, ...params);
            },
          },
        }
      : {}),
    // No user: boot work is the system acting, never a person.
    audit: async (action: string, detail?: string) => {
      await audit(`helper.${def.id}.${action}`, { detail });
    },
  };
}

/**
 * Bring installed helpers up to date and start them. ⚠ Idempotent per process — Next may import
 * this module twice, and a second boot would double every timer.
 *
 * ⚠ **Migrating and starting are separate.** Schema is brought current for every INSTALLED helper,
 *   since a disabled module can be re-enabled at any moment. But `onBoot` runs only for one an
 *   ENABLED module needs, or switching an add-on off leaves a socket open. **The failure is
 *   not a crash; it is an off switch that looks like it worked.**
 *
 * REFS lib/modules/manage.ts › ensureModuleMigrations() — the module-side equivalent
 *      lib/helpers/registry.ts › activeHelperIds() — what "an enabled module depends on" means
 */
export async function bootHelpers(): Promise<void> {
  if (booted) return;
  booted = true;

  const required = allRequiredHelperIds();
  const active = await activeHelperIds();
  const helpers = getAllHelpers().filter((h) => required.has(h.id));

  for (const def of helpers) {
    try {
      // Schema first: a helper that gained tables in an update must not run against the
      // old layout — the same failure modules hit before ensureModuleMigrations existed.
      await runHelperMigrations(def);
      await prisma.helper.upsert({
        where: { id: def.id },
        create: {
          id: def.id,
          name: def.name,
          version: def.version,
          providesJson: JSON.stringify((def.provides ?? []).map((c) => c.permission)),
          migratedVersion: def.version,
        },
        update: {
          name: def.name,
          version: def.version,
          providesJson: JSON.stringify((def.provides ?? []).map((c) => c.permission)),
          migratedVersion: def.version,
        },
      });

      // Started only if something enabled needs it. A helper whose add-ons are all off stays
      // migrated and dormant, which is what the switch is understood to mean.
      if (def.onBoot && active.has(def.id)) {
        // Bounded: a helper that hangs here would hang the whole server's startup.
        await Promise.race([
          def.onBoot(bootContext(def)),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error("boot timed out")), BOOT_BUDGET_MS),
          ),
        ]);
      }
    } catch (e) {
      // Isolated on purpose — see the note above.
      console.error(`[helpers] "${def.id}" failed to start:`, e);
    }
  }
}

/**
 * Tell every installed helper a service account was deleted (SEC-07).
 *
 * ⚠ **Hygiene, not safety.** A helper's real protection is re-resolving the account on every call
 *   and failing closed, which holds whether or not this runs — so every failure here is swallowed.
 *   The account is already gone, and a helper must not be able to block or reverse a deletion.
 * REFS lib/helpers/types.ts › onIdentityRemoved — the contract
 *      lib/auth/service-accounts.ts › resolveBindableAccount() — the actual guarantee
 *      app/admin/actions.ts — the caller, on delete
 */
export async function notifyIdentityRemoved(accountId: string): Promise<void> {
  for (const def of getAllHelpers()) {
    if (!def.onIdentityRemoved) continue;
    try {
      await Promise.race([
        def.onIdentityRemoved(bootContext(def), accountId),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("onIdentityRemoved timed out")), BOOT_BUDGET_MS),
        ),
      ]);
    } catch (e) {
      console.error(`[helpers] "${def.id}" onIdentityRemoved failed:`, e);
    }
  }
}
