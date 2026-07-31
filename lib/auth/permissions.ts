import "server-only";
import { cache } from "react";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Capability-based access control (delegated admin).
 *
 * A full ADMIN implicitly has every capability. A regular USER has only the
 * capabilities granted by the AccessRoles assigned to them (the union). This
 * lets specific admin powers be delegated without handing out full ADMIN.
 *
 * Kept deliberately ADMIN-only (not delegable): managing AccessRoles themselves,
 * assigning AccessRoles to users, creating/editing ADMIN-role accounts, and
 * restoring a backup. See the individual server actions.
 */

/*
 * The delegable admin capabilities. Keep this in sync with the admin feature
 * surface: when a new admin section/page is added, add a matching capability here
 * (or make a deliberate decision to keep it ADMIN-only — see the not-delegable list
 * above). Full ADMIN implies every capability.
 * REFS app/admin/access-roles/[id]/page.tsx
 */
export const PERMISSIONS = {
  "users.manage": "Manage users (create, disable, delete, services)",
  "users.reset": "Reset access (password + 2FA)",
  "groups.manage": "Manage service groups",
  "sessions.manage": "Manage sessions",
  "audit.view": "View the audit log",
  "settings.manage": "Manage settings and updates",
  "network.manage": "Manage network & HTTPS",
  "email.manage": "Manage email",
  "backups.manage": "Manage backups (export)",
  "modules.manage": "Manage modules (install, enable, configure)",
} as const;

/**
 * REFS app/admin/updates/module-actions.ts · lib/auth/guards.ts
 * PINS tests/unit/permissions.test.ts
 */
export type Permission = keyof typeof PERMISSIONS;

/**
 * REFS app/admin/access-roles/[id]/page.tsx · app/admin/users/[id]/page.tsx
 * PINS tests/unit/admin-roles-guard.test.ts · tests/unit/permissions.test.ts
 */
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && value in PERMISSIONS;
}

/** Keep only valid, de-duplicated capability keys from arbitrary input. */
/**
 * REFS app/admin/access-roles/actions.ts
 * PINS tests/unit/permissions.test.ts
 */
export function sanitizePermissions(values: unknown[]): Permission[] {
  const seen = new Set<Permission>();
  for (const v of values) if (isPermission(v)) seen.add(v);
  return ALL_PERMISSIONS.filter((p) => seen.has(p));
}

/** Parse a stored permissionsJson string into a valid permission list. */
/**
 * REFS app/admin/access-roles/[id]/page.tsx · app/admin/access-roles/page.tsx
 * PINS tests/unit/permissions.test.ts
 */
export function parsePermissionsJson(json: string): Permission[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? sanitizePermissions(arr) : [];
  } catch {
    return [];
  }
}

/**
 * The effective capabilities for a user. ADMIN => all; otherwise the union of
 * the permissions on their assigned access roles. Memoized per request so the
 * many per-page/per-action guard checks share one query.
 * PINS tests/unit/admin-roles-guard.test.ts · tests/unit/service-accounts.test.ts
 */
export async function getEffectivePermissionsUncached(
  user: Pick<User, "id" | "role">,
): Promise<Set<Permission>> {
  if (user.role === "ADMIN") return new Set(ALL_PERMISSIONS);
  const roles = await prisma.accessRole.findMany({
    where: { users: { some: { id: user.id } } },
    select: { permissionsJson: true },
  });
  const out = new Set<Permission>();
  for (const r of roles) for (const p of parsePermissionsJson(r.permissionsJson)) out.add(p);
  return out;
}

/**
 * The same answer, memoized per request — ⚠ use THIS one inside a request. It wraps the uncached
 * body above, so the two cannot disagree.
 * ⚠ Work OUTSIDE a request — a helper's listener, with no React render — must call
 * `getEffectivePermissionsUncached` by name. `cache()` outside a render happens to neither throw
 * nor memoize today, but that is undocumented React internal behaviour: if it ever threw, or
 * memoized process-globally, authorization would break or leak silently.
 * REFS app/(app)/layout.tsx · app/admin/actions.ts · app/admin/users/[id]/page.tsx
 *      app/api/backup/export/route.ts · lib/auth/guards.ts · lib/auth/service-accounts.ts
 * PINS tests/integration/access-roles.test.ts · tests/unit/service-accounts.test.ts
 */
export const getEffectivePermissions = cache(getEffectivePermissionsUncached);

/** Does the user (ADMIN or via access roles) have this capability? */
/** REFS app/admin/email/oauth/callback/route.ts · app/admin/email/oauth/route.ts */
export async function userHasPermission(
  user: Pick<User, "id" | "role">,
  cap: Permission,
): Promise<boolean> {
  return (await getEffectivePermissions(user)).has(cap);
}

/**
 * Admin nav sections and the capability that unlocks each. "Access Roles" is
 * intentionally absent — it stays ADMIN-only (delegating who can grant powers is
 * itself a privilege boundary) and is added separately in the layout. Every other
 * admin section has a delegable capability so the access-role model matches the
 * admin surface — keep this list and PERMISSIONS in sync when adding sections.
 */
export const ADMIN_SECTIONS: {
  href: string;
  label: string;
  anyOf: Permission[];
}[] = [
  { href: "/admin", label: "Users", anyOf: ["users.manage", "users.reset"] },
  { href: "/admin/service-groups", label: "Service Groups", anyOf: ["groups.manage"] },
  { href: "/admin/sessions", label: "Sessions", anyOf: ["sessions.manage"] },
  { href: "/admin/audit", label: "Audit", anyOf: ["audit.view"] },
  { href: "/admin/backup", label: "Backup", anyOf: ["backups.manage"] },
  { href: "/admin/settings", label: "Settings", anyOf: ["settings.manage"] },
  { href: "/admin/network", label: "Network & HTTPS", anyOf: ["network.manage"] },
  { href: "/admin/email", label: "Email", anyOf: ["email.manage"] },
  { href: "/admin/modules", label: "Modules", anyOf: ["modules.manage"] },
  { href: "/admin/helpers", label: "Helpers", anyOf: ["modules.manage"] },
];

/** The nav sections a permission set may see (href + label). */
/**
 * REFS lib/auth/guards.ts
 * PINS tests/unit/permissions.test.ts
 */
export function allowedSections(perms: Set<Permission>): { href: string; label: string }[] {
  return ADMIN_SECTIONS.filter((s) => s.anyOf.some((c) => perms.has(c))).map(
    ({ href, label }) => ({ href, label }),
  );
}

/** The first admin section a permission set may land on, or /dashboard if none. */
/**
 * REFS app/admin/page.tsx · app/admin/users/[id]/page.tsx · lib/auth/guards.ts
 * PINS tests/unit/permissions.test.ts
 */
export function firstPermittedAdminPath(perms: Set<Permission>): string {
  return allowedSections(perms)[0]?.href ?? "/dashboard";
}
