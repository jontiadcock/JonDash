import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";

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

/** Require an admin; redirect non-admins to their dashboard, anon to /login. */
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}
