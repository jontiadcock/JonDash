import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getAllHelpers, allRequiredHelperIds } from "./registry";
import { helperTableName, runHelperMigrations } from "./migrate";
import type { HelperBootContext, HelperDefinition } from "./types";

/**
 * Helper boot phase (MOD-08), called from `instrumentation.ts` — which Next runs ONCE per
 * server instance, before any request is served.
 *
 * This is the whole reason helpers exist as a concept rather than as library code: a
 * scheduler that only starts when someone renders a page isn't a scheduler. Restart at
 * 03:00 and nothing runs until someone opens the dashboard at 08:00 — least reliable
 * exactly when you'd most want it watching.
 *
 * Two constraints follow from "must complete before requests are served":
 *  - **Register intent, don't do work.** Everything here delays the server becoming
 *    ready. A helper starts a timer and returns; work happens on the first tick.
 *  - **A helper must never stop the server booting.** Each one is isolated: a throw is
 *    logged and recorded, and the remaining helpers and the app carry on. A monitoring
 *    helper must not be the reason the dashboard won't start.
 */

const BOOT_BUDGET_MS = 5000;

let booted = false;

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
 * Bring installed helpers up to date and start them. Idempotent per process — Next may
 * import this module more than once, and a second boot would double every timer.
 */
export async function bootHelpers(): Promise<void> {
  if (booted) return;
  booted = true;

  const required = allRequiredHelperIds();
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

      if (def.onBoot) {
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
