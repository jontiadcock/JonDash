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

export const PERMISSIONS = {
  "users.manage": "Manage users (create, disable, delete, services)",
  "users.reset": "Reset access (password + 2FA)",
  "groups.manage": "Manage service groups",
  "sessions.manage": "Manage sessions",
  "audit.view": "View the audit log",
  "settings.manage": "Manage settings",
  "backups.manage": "Manage backups (export)",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && value in PERMISSIONS;
}

/** Keep only valid, de-duplicated capability keys from arbitrary input. */
export function sanitizePermissions(values: unknown[]): Permission[] {
  const seen = new Set<Permission>();
  for (const v of values) if (isPermission(v)) seen.add(v);
  return ALL_PERMISSIONS.filter((p) => seen.has(p));
}

/** Parse a stored permissionsJson string into a valid permission list. */
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
 */
export const getEffectivePermissions = cache(
  async (user: Pick<User, "id" | "role">): Promise<Set<Permission>> => {
    if (user.role === "ADMIN") return new Set(ALL_PERMISSIONS);
    const roles = await prisma.accessRole.findMany({
      where: { users: { some: { id: user.id } } },
      select: { permissionsJson: true },
    });
    const out = new Set<Permission>();
    for (const r of roles) for (const p of parsePermissionsJson(r.permissionsJson)) out.add(p);
    return out;
  },
);

/** Does the user (ADMIN or via access roles) have this capability? */
export async function userHasPermission(
  user: Pick<User, "id" | "role">,
  cap: Permission,
): Promise<boolean> {
  return (await getEffectivePermissions(user)).has(cap);
}

/**
 * Admin nav sections and the capability that unlocks each. "Access Roles" is
 * intentionally absent — it is ADMIN-only and added separately in the layout.
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
];

/** The nav sections a permission set may see (href + label). */
export function allowedSections(perms: Set<Permission>): { href: string; label: string }[] {
  return ADMIN_SECTIONS.filter((s) => s.anyOf.some((c) => perms.has(c))).map(
    ({ href, label }) => ({ href, label }),
  );
}

/** The first admin section a permission set may land on, or /dashboard if none. */
export function firstPermittedAdminPath(perms: Set<Permission>): string {
  return allowedSections(perms)[0]?.href ?? "/dashboard";
}
