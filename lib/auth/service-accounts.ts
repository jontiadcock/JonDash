import "server-only";
import type { User } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * SEC-07 · Service accounts — an identity nobody can ever sign in as.
 *
 * **This module is the single place that answers "is this thing a login?".** Every guard in the
 * auth path calls `isServiceAccount()` rather than testing the column itself, so the definition
 * can never drift between the six or seven places that need it.
 *
 * **Why not just leave `passwordHash` null?** Because a null hash is an *absence*, and an absence
 * is something a later code path can fill in without realising what it has undone — a password
 * reset, a restore, an import. The flag is a *statement*, and statements survive contact with code
 * that wasn't written with this feature in mind.
 */

/** A `Pick` wide enough for every guard here, so callers needn't load the whole row. */
export type MaybeServiceAccount = Pick<User, "isServiceAccount">;

/** The one definition. Never test the column directly. */
/**
 * REFS app/admin/actions.ts · app/admin/page.tsx · app/admin/users/[id]/page.tsx
 *      app/login/actions.ts · app/setup/[token]/actions.ts · lib/auth/bootstrap.ts
 * PINS tests/unit/admin-roles-guard.test.ts · tests/unit/service-accounts.test.ts
 */
export function isServiceAccount(user: MaybeServiceAccount | null | undefined): boolean {
  return user?.isServiceAccount === true;
}

/**
 * How an account should read in the AUDIT LOG. ⚠ An action taken under a service account is
 * attributed to that account, never to a person — half the reason SEC-07 exists is a log that said
 * a person revoked a session when it was an agent. A person stays their email; a service account is
 * its name plus an explicit marker, because a bare name in a column that usually holds an address
 * is the ambiguity being removed.
 * REFS app/admin/actions.ts
 * PINS tests/unit/service-accounts.test.ts
 */
export function serviceAccountLabel(
  user: Pick<User, "email" | "isServiceAccount"> & { displayName?: string | null },
): string {
  if (!isServiceAccount(user)) return user.email;
  return `${user.displayName ?? user.email} (service account)`;
}

/**
 * Whether an ACTIVE HUMAN admin exists — the lockout guard.
 *
 * ⚠ Excludes service accounts, and anything asking "is there still an admin?" must use this rather
 * than a bare `role: ADMIN` count. If a service account satisfied it, then once every human admin
 * was gone the first-run recovery wizard would never appear and nobody could sign in as the account
 * keeping it quiet — a permanently unrecoverable install.
 * REFS lib/auth/bootstrap.ts
 * PINS tests/unit/service-accounts.test.ts
 */
export async function countHumanAdmins(): Promise<number> {
  return prisma.user.count({
    where: { role: "ADMIN", status: "ACTIVE", isServiceAccount: false },
  });
}

/**
 * The internal email handle for a service account.
 *
 * A service account has no mailbox, but `User.email` is the unique key the schema and much of the
 * app are built around. Rather than let an admin type an address — which invites a real one, and
 * invites confusion about whether mail goes there — core generates a handle on a reserved,
 * non-routable suffix. `.invalid` is reserved by RFC 2606 precisely so it can never resolve.
 *
 * The admin names the account; `displayName` is what anyone actually sees.
 */
export const SERVICE_ACCOUNT_EMAIL_SUFFIX = "@service.invalid";

/**
 * Generated, not derived from the row id — the two need not match, and not coupling them means the
 * account can be created in a single write with Prisma issuing the id as it does for everyone else.
 * Uses `randomUUID()` rather than pulling in a cuid package: this only has to be unique, and
 * [[install-footprint]] says don't add a dependency for something the platform already does.
 * REFS app/admin/actions.ts
 * PINS tests/unit/service-accounts.test.ts
 */
export function serviceAccountHandle(): string {
  return `svc-${randomUUID()}${SERVICE_ACCOUNT_EMAIL_SUFFIX}`;
}

/**
 * What a helper may see about a bindable identity — **exactly four fields, deliberately**.
 *
 * Agreed with the add-ons session, 2026-07-26. `id` is stable and opaque and is the only thing a
 * helper stores; `displayName` is rendered at display time and never stored, so renaming is free;
 * `status` lets a helper fail closed; `role` is what `getEffectivePermissions` takes.
 *
 * **Nothing else is exposed, and that is a ceiling rather than a starting point** — their words:
 * *"if it ever grows a secret, I don't want to be able to read it."*
 * PINS tests/unit/service-accounts.test.ts
 */
export type BindableAccount = {
  id: string;
  displayName: string;
  status: User["status"];
  role: User["role"];
};

/**
 * Every account a helper may bind a credential to.
 *
 * **This list contains service accounts ONLY — a human never appears in it** (owner, 2026-07-26).
 * That is stronger than filtering at the helper's end: there is nothing for a helper to filter, and
 * no way to bind to a person even by mistake.
 *
 * **The list is also the predicate.** A helper decides "may I bind to this?" by asking whether the
 * id is in here — there is deliberately no separate `isBindable(id)` that could one day disagree
 * with what the picker shows.
 * PINS tests/unit/service-accounts.test.ts
 */
export async function listBindableAccounts(): Promise<BindableAccount[]> {
  const rows = await prisma.user.findMany({
    where: { isServiceAccount: true },
    select: { id: true, displayName: true, email: true, status: true, role: true },
    orderBy: { displayName: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    // Every service account is created with a displayName; the fallback exists so a row written by
    // some future path without one is still identifiable rather than blank in a picker.
    displayName: r.displayName ?? r.email,
    status: r.status,
    role: r.role,
  }));
}

/**
 * Resolve one bindable account, or `null`.
 *
 * A helper calls this on **every** request rather than trusting what it stored, which is what makes
 * deletion safe without depending on a notification arriving. Returns `null` for a human, for an
 * unknown id, and for a deleted one — all of which a caller must treat identically: refuse.
 *
 * Note it does **not** filter on status. A helper needs to distinguish "disabled" from "gone" to
 * report a useful error, so status is returned and the caller fails closed on anything but ACTIVE.
 * REFS lib/helpers/boot.ts · lib/helpers/types.ts
 * PINS tests/unit/service-accounts.test.ts
 */
export async function resolveBindableAccount(
  id: string,
  helperId?: string,
): Promise<BindableAccount | null> {
  const r = await prisma.user.findFirst({
    where: { id: String(id), isServiceAccount: true },
    select: {
      id: true, displayName: true, email: true, status: true, role: true,
      lastUsedAt: true,
    },
  });
  if (!r) return null;
  if (helperId) void stampUsage(r.id, String(helperId), r.lastUsedAt);
  return { id: r.id, displayName: r.displayName ?? r.email, status: r.status, role: r.role };
}

/**
 * Don't write on every single call — a busy agent would otherwise generate one UPDATE per request.
 */
const USAGE_STAMP_INTERVAL_MS = 60_000;

/**
 * Record that a helper used this identity, for the "last used / by what" line on its page.
 *
 * **Fire-and-forget, throttled, and never able to affect the answer.** It is called with `void`
 * from `resolveBindableAccount`, which is on the authorization path: a failure to write a
 * cosmetic timestamp must never turn into a failure to authorize, and a slow write must never
 * become latency on every agent request. So it is not awaited and its errors are swallowed.
 *
 * Throttled to once a minute per account because the precision that matters is "today vs three
 * months ago" — the question this answers is *"is this account still in use, or did I forget it?"*,
 * not *"what was the exact second?"*.
 */
async function stampUsage(id: string, helperId: string, lastUsedAt: Date | null): Promise<void> {
  if (lastUsedAt && Date.now() - lastUsedAt.getTime() < USAGE_STAMP_INTERVAL_MS) return;
  try {
    await prisma.user.update({
      where: { id },
      data: { lastUsedAt: new Date(), lastUsedByHelper: helperId },
    });
  } catch {
    /* cosmetic — never let this break an authorization path */
  }
}
