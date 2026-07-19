import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import {
  getEffectivePermissions,
  allowedSections,
  firstPermittedAdminPath,
  type Permission,
} from "@/lib/auth/permissions";

/** Return the current active user or null. */
export async function getCurrentUser(): Promise<User | null> {
  return getSessionUser();
}

/** Require any authenticated active user; redirect to /login otherwise. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Require a full admin; redirect non-admins to their dashboard, anon to /login. */
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

/**
 * Require a specific admin capability (full ADMIN satisfies all). Anonymous
 * users go to /login; authenticated users lacking the capability go to their
 * own dashboard.
 */
export async function requirePermission(cap: Permission): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const perms = await getEffectivePermissions(user);
  if (!perms.has(cap)) redirect("/dashboard");
  return user;
}

/** Require at least one of the given capabilities. */
export async function requireAnyPermission(caps: Permission[]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const perms = await getEffectivePermissions(user);
  if (!caps.some((c) => perms.has(c))) redirect("/dashboard");
  return user;
}

/**
 * Gate the admin area: the user must be a full ADMIN or hold at least one
 * capability. Returns the user plus the nav sections they may see. Used by the
 * admin layout; each page still enforces its own specific capability.
 */
export async function requireAdminArea(): Promise<{
  user: User;
  perms: Set<Permission>;
  sections: { href: string; label: string }[];
}> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const perms = await getEffectivePermissions(user);
  if (perms.size === 0) redirect("/dashboard");
  return { user, perms, sections: allowedSections(perms) };
}

export { firstPermittedAdminPath };
