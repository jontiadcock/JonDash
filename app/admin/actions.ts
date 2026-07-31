"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isServiceAccount, serviceAccountLabel, serviceAccountHandle } from "@/lib/auth/service-accounts";
import { getRequestOrigin } from "@/lib/request";
import { requireAdmin, requirePermission, requireAnyPermission } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { generateToken, hashToken } from "@/lib/crypto";
import { revokeAllSessions } from "@/lib/auth/session";
import { processIconUpload } from "@/lib/security/upload";
import { deleteIcon } from "@/lib/icons";
import { audit } from "@/lib/audit";
import { notifyIdentityRemoved } from "@/lib/helpers/boot";
import {
  createUserSchema,
  createLinkSchema,
  updateLinkSchema,
  roleNameSchema,
} from "@/lib/validation/schemas";

const SETUP_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** REFS app/admin/ui.tsx — the `useActionState` shape every form on the admin page reads */
export type AdminState = { error?: string; setupUrl?: string; ok?: boolean };

async function buildSetupUrl(rawToken: string): Promise<string> {
  return `${await getRequestOrigin()}/setup/${rawToken}`;
}

async function newSetupToken() {
  const raw = generateToken(32);
  return {
    raw,
    hash: hashToken(raw),
    expiresAt: new Date(Date.now() + SETUP_TOKEN_TTL_MS),
  };
}

// ---- Users -----------------------------------------------------------------

/** Invite a PERSON: issues a setup token and a one-time link. ⚠ Never use it for an identity
 *  that should not be able to sign in — that is `createServiceAccountAction` below.
 *  REFS app/admin/ui.tsx · lib/auth/service-accounts.ts */
export async function createUserAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await assertSameOrigin();
  const admin = await requirePermission("users.manage");

  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  // Only a full ADMIN may create another ADMIN (no privilege escalation).
  if (parsed.data.role === "ADMIN" && admin.role !== "ADMIN") {
    return { error: "Only a full admin can create admin accounts." };
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { error: "A user with that email already exists." };

  const token = await newSetupToken();
  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      role: parsed.data.role,
      status: "PENDING_SETUP",
      setupTokenHash: token.hash,
      setupTokenExpiresAt: token.expiresAt,
    },
  });

  await audit("admin.user.create", { userId: admin.id, detail: `created ${user.email}` });
  revalidatePath("/admin");
  return { ok: true, setupUrl: await buildSetupUrl(token.raw) };
}

/**
 * Create a service account (SEC-07) — an identity that holds permissions and appears in the audit
 * log, but that nobody can ever sign in as.
 *
 * ⚠ A SEPARATE action from `createUserAction`, never a flag on it. Folding the two together is how
 * a boolean ends up in a form for somebody to flip by accident. Nothing here issues a setup token,
 * a password or MFA — the fields are never written at all, not written empty.
 * ⚠ The email handle is GENERATED on a reserved non-routable suffix, so nobody is invited to type a
 * real address and no service account can collide with a person's.
 * REFS lib/auth/service-accounts.ts › isServiceAccount() — the test everything else keys on
 * PINS tests/unit/service-accounts.test.ts
 */
export async function createServiceAccountAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await assertSameOrigin();
  // Same permission as creating a user: this mints an identity that can hold capabilities.
  const admin = await requirePermission("users.manage");

  const name = String(formData.get("displayName") ?? "").trim();
  if (name.length < 2 || name.length > 60) {
    return { error: "Give the service account a name between 2 and 60 characters." };
  }
  const role = String(formData.get("role") ?? "USER") === "ADMIN" ? "ADMIN" : "USER";
  // Same escalation rule as a user: only a full admin mints an admin-level identity. It matters
  // more here, if anything — an agent holding this never gets challenged for a second factor.
  if (role === "ADMIN" && admin.role !== "ADMIN") {
    return { error: "Only a full admin can create an admin-level service account." };
  }

  const existing = await prisma.user.findFirst({
    where: { isServiceAccount: true, displayName: name },
    select: { id: true },
  });
  if (existing) return { error: "A service account with that name already exists." };

  const user = await prisma.user.create({
    data: {
      email: serviceAccountHandle(),
      displayName: name,
      role,
      isServiceAccount: true,
      // ACTIVE immediately: there is no setup to complete, and PENDING_SETUP would mean an
      // identity waiting for a step that can never happen.
      status: "ACTIVE",
    },
  });

  await audit("admin.service_account.create", {
    userId: admin.id,
    detail: `${serviceAccountLabel(user)} · role ${role}`,
  });
  revalidatePath("/admin");
  return { ok: true };
}

/** ⚠ The sharpest promotion path in the app: sets PENDING_SETUP and issues a working setup link,
 *  which is how an identity acquires a password and MFA. Refuses a service account, and a delegate
 *  may not run it on an ADMIN. REFS app/admin/ui.tsx  PINS tests/unit/service-accounts.test.ts */
export async function resetAccessAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await assertSameOrigin();
  const admin = await requirePermission("users.reset");

  const userId = String(formData.get("userId") ?? "");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "User not found." };
  /*
   * ⚠ SEC-07: refuse outright on a service account. This is the sharpest promotion path in the app
   * — it sets PENDING_SETUP and issues a working setup link, which is exactly how an identity
   * acquires a password and MFA. Running it here turns an unloggable-into identity into a login.
   */
  if (isServiceAccount(user)) {
    return { error: "A service account has no sign-in to reset." };
  }
  // A delegate (non-admin) may not reset an ADMIN account.
  if (user.role === "ADMIN" && admin.role !== "ADMIN") {
    return { error: "Only a full admin can reset an admin account." };
  }

  const token = await newSetupToken();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      status: "PENDING_SETUP",
      passwordHash: null,
      totpSecretEnc: null,
      mfaEnabled: false,
      setupTokenHash: token.hash,
      setupTokenExpiresAt: token.expiresAt,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });
  await revokeAllSessions(user.id);

  await audit("admin.user.reset", { userId: admin.id, detail: `reset ${user.email}` });
  revalidatePath("/admin");
  revalidatePath(`/admin/users/${user.id}`);
  return { ok: true, setupUrl: await buildSetupUrl(token.raw) };
}

/** Enable or disable an account. ⚠ Re-activating a person requires completed setup; a service
 *  account is the deliberate exception, or disabling one is irreversible from the UI.
 *  REFS app/admin/users/[id]/page.tsx · lib/auth/service-accounts.ts › isServiceAccount() */
export async function setUserStatusAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requirePermission("users.manage");

  const userId = String(formData.get("userId") ?? "");
  const disable = formData.get("disable") === "true";
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  // Do not allow an admin to disable their own account.
  if (user.id === admin.id) return;
  // A delegate (non-admin) may not act on an ADMIN account.
  if (user.role === "ADMIN" && admin.role !== "ADMIN") return;

  const label = serviceAccountLabel(user);

  if (disable) {
    await prisma.user.update({ where: { id: user.id }, data: { status: "DISABLED" } });
    await revokeAllSessions(user.id);
    await audit("admin.user.disable", { userId: admin.id, detail: label });
  } else if (isServiceAccount(user) || (user.passwordHash && user.totpSecretEnc)) {
    /*
     * ⚠ Only re-activate a PERSON who completed setup, or "enable" produces an account that exists,
     * looks active and cannot be signed into.
     * ⚠ A SERVICE ACCOUNT is the deliberate exception (SEC-07): it has no password or MFA by design
     * and can never pass that test, so without this branch disabling one is irreversible from the
     * UI.
     */
    await prisma.user.update({ where: { id: user.id }, data: { status: "ACTIVE" } });
    await audit("admin.user.enable", { userId: admin.id, detail: label });
  }
  revalidatePath("/admin");
  revalidatePath(`/admin/users/${user.id}`);
}

/** ⚠ Irreversible, and helpers are notified AFTER the row is gone (SEC-07).
 *  REFS app/admin/users/[id]/page.tsx · lib/auth/service-accounts.ts › notifyIdentityRemoved() */
export async function deleteUserAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requirePermission("users.manage");

  const userId = String(formData.get("userId") ?? "");
  if (userId === admin.id) return; // never delete yourself
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { links: true },
  });
  if (!user) return;
  // A delegate (non-admin) may not delete an ADMIN account.
  if (user.role === "ADMIN" && admin.role !== "ADMIN") return;

  const wasServiceAccount = isServiceAccount(user);

  for (const link of user.links) await deleteIcon(link.iconPath);
  await prisma.user.delete({ where: { id: user.id } }); // cascades sessions + links
  await audit("admin.user.delete", { userId: admin.id, detail: serviceAccountLabel(user) });

  /*
   * ⚠ Tell helpers AFTER the row is gone (SEC-07), so one that re-resolves during its own cleanup
   * sees the truth rather than a row about to vanish. Best-effort by design: the identity is
   * already deleted and every helper fails closed on the next call regardless.
   * REFS lib/auth/service-accounts.ts › notifyIdentityRemoved()
   */
  if (wasServiceAccount) await notifyIdentityRemoved(user.id);
  revalidatePath("/admin");
  // The user's detail page no longer exists — send the admin back to the list.
  redirect("/admin");
}

// ---- Links -----------------------------------------------------------------

async function processOptionalIcon(formData: FormData): Promise<
  { ok: true; filename: string | null } | { ok: false; error: string }
> {
  const file = formData.get("icon");
  if (!(file instanceof File) || file.size === 0) return { ok: true, filename: null };
  const result = await processIconUpload(file);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, filename: result.filename };
}

/**
 * Revalidate everything a link change is visible on.
 *
 * ⚠ `/dashboard` is the one that matters and the one that was missing: link actions revalidated
 * only the admin page they ran on, so a correctly created tile stayed invisible until something
 * else invalidated the route.
 * ⚠ A ROLE link revalidates for everyone — it belongs to a service group, so the tile appears on
 * every member's dashboard. REFS lib/services.ts › getUserVisibleLinks()
 * PINS tests/unit/link-revalidation.test.ts
 */
function revalidateLinkOwner(link: { userId: string | null; roleId: string | null }) {
  if (link.userId) revalidatePath(`/admin/users/${link.userId}`);
  if (link.roleId) revalidatePath(`/admin/service-groups/${link.roleId}`);
  revalidatePath("/dashboard");
}

/** ⚠ Must revalidate the DASHBOARD, not just the admin page — REFS revalidateLinkOwner() above.
 *  app/admin/ui.tsx  PINS tests/unit/link-revalidation.test.ts */
export async function createLinkAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await assertSameOrigin();
  const admin = await requirePermission("users.manage");

  const userId = String(formData.get("userId") ?? "");
  const owner = await prisma.user.findUnique({ where: { id: userId } });
  if (!owner) return { error: "User not found." };

  const parsed = createLinkSchema.safeParse({
    title: formData.get("title"),
    url: formData.get("url"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const icon = await processOptionalIcon(formData);
  if (!icon.ok) return { error: icon.error };

  const max = await prisma.link.aggregate({
    where: { userId },
    _max: { sortOrder: true },
  });
  await prisma.link.create({
    data: {
      userId,
      title: parsed.data.title,
      url: parsed.data.url,
      iconPath: icon.filename,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });

  await audit("admin.link.create", { userId: admin.id, detail: `${owner.email}: ${parsed.data.title}` });
  // ⚠ CREATE must revalidate the dashboard too. Editing and deleting already did; creating never
  // had, so a brand-new tile was the one case that stayed invisible.
  revalidateLinkOwner({ userId, roleId: null });
  return { ok: true };
}

/**
 * REFS app/admin/ui.tsx · revalidateLinkOwner() above  PINS tests/unit/link-revalidation.test.ts
 */
export async function updateLinkAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await assertSameOrigin();
  await requireAnyPermission(["users.manage", "groups.manage"]);

  const parsed = updateLinkSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title"),
    url: formData.get("url"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const link = await prisma.link.findUnique({ where: { id: parsed.data.id } });
  if (!link) return { error: "Link not found." };

  const icon = await processOptionalIcon(formData);
  if (!icon.ok) return { error: icon.error };

  await prisma.link.update({
    where: { id: link.id },
    data: {
      title: parsed.data.title,
      url: parsed.data.url,
      ...(icon.filename ? { iconPath: icon.filename } : {}),
    },
  });
  if (icon.filename && link.iconPath) await deleteIcon(link.iconPath);

  revalidateLinkOwner(link);
  return { ok: true };
}

/** REFS app/admin/link-list.tsx · revalidateLinkOwner() above
 *  PINS tests/unit/link-revalidation.test.ts */
export async function deleteLinkAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  await requireAnyPermission(["users.manage", "groups.manage"]);

  const id = String(formData.get("id") ?? "");
  const link = await prisma.link.findUnique({ where: { id } });
  if (!link) return;
  await deleteIcon(link.iconPath);
  await prisma.link.delete({ where: { id } });
  revalidateLinkOwner(link);
}

/** Reorder a link within its owner. ⚠ Writes `Link.sortOrder`, which is SHARED — a role link's
 *  order is the same for every member. Per-user arrangement is lib/dashboard/layout.ts instead.
 *  REFS app/admin/link-list.tsx */
export async function moveLinkAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  await requireAnyPermission(["users.manage", "groups.manage"]);

  const id = String(formData.get("id") ?? "");
  const dir = String(formData.get("dir") ?? "");
  const link = await prisma.link.findUnique({ where: { id } });
  if (!link) return;

  // Scope to the same owner (user or role) as the link being moved.
  const ownerScope = link.userId ? { userId: link.userId } : { roleId: link.roleId };
  const neighbor = await prisma.link.findFirst({
    where: {
      ...ownerScope,
      sortOrder: dir === "up" ? { lt: link.sortOrder } : { gt: link.sortOrder },
    },
    orderBy: { sortOrder: dir === "up" ? "desc" : "asc" },
  });
  if (!neighbor) return;

  await prisma.$transaction([
    prisma.link.update({ where: { id: link.id }, data: { sortOrder: neighbor.sortOrder } }),
    prisma.link.update({ where: { id: neighbor.id }, data: { sortOrder: link.sortOrder } }),
  ]);
  revalidateLinkOwner(link);
}

// ---- Roles -----------------------------------------------------------------

/** Create a Service Group. REFS app/admin/ui.tsx · lib/services.ts › getUserVisibleLinks() —
 *  every member sees this group's tiles */
export async function createRoleAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await assertSameOrigin();
  const admin = await requirePermission("groups.manage");

  const parsed = roleNameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid name." };

  const existing = await prisma.serviceRole.findUnique({ where: { name: parsed.data } });
  if (existing) return { error: "A role with that name already exists." };

  await prisma.serviceRole.create({ data: { name: parsed.data } });
  await audit("admin.role.create", { userId: admin.id, detail: parsed.data });
  // Roles appear as checkboxes on every user page — refresh the whole admin tree.
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** REFS app/admin/ui.tsx · lib/services.ts › VisibleLink.source — the name is shown on tiles */
export async function renameRoleAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await assertSameOrigin();
  await requirePermission("groups.manage");

  const id = String(formData.get("id") ?? "");
  const parsed = roleNameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid name." };

  const clash = await prisma.serviceRole.findFirst({
    where: { name: parsed.data, NOT: { id } },
  });
  if (clash) return { error: "Another role already has that name." };

  await prisma.serviceRole.update({ where: { id }, data: { name: parsed.data } });
  // Role name shows on user pages too — refresh the whole admin tree.
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** ⚠ Removes the group's shared tiles from every member's dashboard at once.
 *  REFS app/admin/service-groups/[id]/page.tsx · lib/services.ts */
export async function deleteRoleAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requirePermission("groups.manage");

  const id = String(formData.get("id") ?? "");
  const role = await prisma.serviceRole.findUnique({
    where: { id },
    include: { links: true },
  });
  if (!role) return;

  for (const link of role.links) await deleteIcon(link.iconPath);
  await prisma.serviceRole.delete({ where: { id } }); // cascades its links + assignments
  await audit("admin.role.delete", { userId: admin.id, detail: role.name });
  // The group was a checkbox on every user page — refresh the whole admin tree.
  revalidatePath("/admin", "layout");
  // The group's detail page no longer exists — send the admin back to the list.
  redirect("/admin/service-groups");
}

/** A tile shared with every member of a Service Group. ⚠ Revalidated for everyone, not one user.
 *  REFS app/admin/ui.tsx · revalidateLinkOwner() above
 *  PINS tests/unit/link-revalidation.test.ts */
export async function createRoleLinkAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await assertSameOrigin();
  const admin = await requirePermission("groups.manage");

  const roleId = String(formData.get("roleId") ?? "");
  const role = await prisma.serviceRole.findUnique({ where: { id: roleId } });
  if (!role) return { error: "Role not found." };

  const parsed = createLinkSchema.safeParse({
    title: formData.get("title"),
    url: formData.get("url"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const icon = await processOptionalIcon(formData);
  if (!icon.ok) return { error: icon.error };

  const max = await prisma.link.aggregate({
    where: { roleId },
    _max: { sortOrder: true },
  });
  await prisma.link.create({
    data: {
      roleId,
      title: parsed.data.title,
      url: parsed.data.url,
      iconPath: icon.filename,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });

  await audit("admin.role.link.create", { userId: admin.id, detail: `${role.name}: ${parsed.data.title}` });
  // Same gap as createLinkAction — a group's new tile appears on every member's dashboard.
  revalidateLinkOwner({ userId: null, roleId });
  return { ok: true };
}

/** Replace a user's Service Groups. ⚠ Changes what tiles they can see, so it is a visibility
 *  change, not just a label. REFS app/admin/users/[id]/page.tsx · lib/services.ts */
export async function setUserRolesAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requirePermission("users.manage");

  const userId = String(formData.get("userId") ?? "");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const roleIds = formData.getAll("roleIds").map((v) => String(v)).filter(Boolean);

  await prisma.user.update({
    where: { id: userId },
    data: { serviceRoles: { set: roleIds.map((id) => ({ id })) } },
  });
  await audit("admin.user.roles.set", {
    userId: admin.id,
    detail: `${user.email}: ${roleIds.length} role(s)`,
  });
  revalidatePath(`/admin/users/${userId}`);
}

/**
 * Replace a user's assigned access roles. ⚠ ADMIN only — assigning capabilities is itself a
 * privilege-granting action and must never be delegated.
 * REFS lib/auth/permissions.ts › getEffectivePermissions() · app/admin/users/[id]/page.tsx
 * PINS tests/unit/admin-roles-guard.test.ts
 */
export async function setUserAccessRolesAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  /*
   * ⚠ BUG-57: refuse on an ADMIN or a service account HERE, not just by hiding the form. A page
   * that states a rule while the action still accepts the write is telling the truth by luck.
   * ⚠ It must NOT clear the stored rows — demoting the account to a normal user has to restore
   * whatever was assigned, and clearing on save discards it silently.
   * REFS lib/auth/permissions.ts › getEffectivePermissions() — short-circuits for an ADMIN
   */
  if (user.role === "ADMIN" || isServiceAccount(user)) {
    await audit("admin.user.accessroles.refused", {
      userId: admin.id,
      detail: `${user.email}: ${user.role === "ADMIN" ? "admin already holds every capability" : "service account"}`,
    });
    return;
  }

  const accessRoleIds = formData
    .getAll("accessRoleIds")
    .map((v) => String(v))
    .filter(Boolean);

  await prisma.user.update({
    where: { id: userId },
    data: { accessRoles: { set: accessRoleIds.map((id) => ({ id })) } },
  });
  await audit("admin.user.accessroles.set", {
    userId: admin.id,
    detail: `${user.email}: ${accessRoleIds.length} access role(s)`,
  });
  revalidatePath(`/admin/users/${userId}`);
}
