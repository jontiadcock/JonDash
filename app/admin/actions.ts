"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getRequestOrigin } from "@/lib/request";
import { requireAdmin } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { generateToken, hashToken } from "@/lib/crypto";
import { revokeAllSessions } from "@/lib/auth/session";
import { processIconUpload } from "@/lib/security/upload";
import { deleteIcon } from "@/lib/icons";
import { audit } from "@/lib/audit";
import {
  createUserSchema,
  createLinkSchema,
  updateLinkSchema,
  roleNameSchema,
} from "@/lib/validation/schemas";

const SETUP_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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

export async function createUserAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await assertSameOrigin();
  const admin = await requireAdmin();

  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
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

export async function resetAccessAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await assertSameOrigin();
  const admin = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "User not found." };

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

export async function setUserStatusAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const disable = formData.get("disable") === "true";
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  // Do not allow an admin to disable their own account.
  if (user.id === admin.id) return;

  if (disable) {
    await prisma.user.update({ where: { id: user.id }, data: { status: "DISABLED" } });
    await revokeAllSessions(user.id);
    await audit("admin.user.disable", { userId: admin.id, detail: user.email });
  } else if (user.passwordHash && user.totpSecretEnc) {
    // Only re-activate if the account previously completed setup.
    await prisma.user.update({ where: { id: user.id }, data: { status: "ACTIVE" } });
    await audit("admin.user.enable", { userId: admin.id, detail: user.email });
  }
  revalidatePath("/admin");
  revalidatePath(`/admin/users/${user.id}`);
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  if (userId === admin.id) return; // never delete yourself
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { links: true },
  });
  if (!user) return;

  for (const link of user.links) await deleteIcon(link.iconPath);
  await prisma.user.delete({ where: { id: user.id } }); // cascades sessions + links
  await audit("admin.user.delete", { userId: admin.id, detail: user.email });
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

/** Revalidate the page that owns a link (a user's page or a service group's page). */
function revalidateLinkOwner(link: { userId: string | null; roleId: string | null }) {
  if (link.userId) revalidatePath(`/admin/users/${link.userId}`);
  if (link.roleId) revalidatePath(`/admin/service-groups/${link.roleId}`);
}

export async function createLinkAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await assertSameOrigin();
  const admin = await requireAdmin();

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
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}

export async function updateLinkAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await assertSameOrigin();
  await requireAdmin();

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

export async function deleteLinkAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const link = await prisma.link.findUnique({ where: { id } });
  if (!link) return;
  await deleteIcon(link.iconPath);
  await prisma.link.delete({ where: { id } });
  revalidateLinkOwner(link);
}

export async function moveLinkAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  await requireAdmin();

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

export async function createRoleAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await assertSameOrigin();
  const admin = await requireAdmin();

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

export async function renameRoleAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await assertSameOrigin();
  await requireAdmin();

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

export async function deleteRoleAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireAdmin();

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

export async function createRoleLinkAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await assertSameOrigin();
  const admin = await requireAdmin();

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
  revalidatePath(`/admin/service-groups/${roleId}`);
  return { ok: true };
}

/** Replace a user's full set of assigned roles from checkbox selections. */
export async function setUserRolesAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireAdmin();

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
