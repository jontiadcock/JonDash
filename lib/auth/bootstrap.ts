import "server-only";
import { prisma } from "@/lib/db";
import { countHumanAdmins } from "@/lib/auth/service-accounts";

/**
 * Whether an admin has finished setup. Drives the first-run wizard.
 *
 * **Counts HUMANS only (SEC-07).** This function is the sole gate on the recovery wizard, so if a
 * service account could satisfy it, an install whose last human admin was deleted would show the
 * login page forever — with nobody able to sign in, and the wizard that exists to rescue exactly
 * that situation permanently suppressed by an account that cannot itself be used.
 *
 * The delegation lives in `service-accounts.ts` so there is one definition of "human", not a
 * `isServiceAccount: false` clause copied into every future admin-count query.
 * REFS app/login/page.tsx · app/page.tsx · app/welcome/actions.ts · app/welcome/page.tsx
 *      lib/auth/service-accounts.ts
 * PINS tests/integration/welcome-restore.test.ts · tests/unit/service-accounts.test.ts
 */
export async function hasActiveAdmin(): Promise<boolean> {
  return (await countHumanAdmins()) > 0;
}

/**
 * The admin currently mid-way through first-run setup, if any.
 *
 * A service account is never `PENDING_SETUP` — it has no setup to complete — but the filter is
 * explicit rather than assumed, because "it can't happen" is how it eventually happens.
 * REFS app/welcome/actions.ts · app/welcome/page.tsx
 * PINS tests/unit/service-accounts.test.ts
 */
export async function getPendingAdmin() {
  return prisma.user.findFirst({
    where: { role: "ADMIN", status: "PENDING_SETUP", isServiceAccount: false },
    orderBy: { createdAt: "asc" },
  });
}
