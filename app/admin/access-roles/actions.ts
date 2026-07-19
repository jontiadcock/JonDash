"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { assertSameOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { sanitizePermissions } from "@/lib/auth/permissions";
import { accessRoleNameSchema } from "@/lib/validation/schemas";

// Access roles grant admin capabilities, so every action here is full-ADMIN only.

export type AccessRoleState = { error?: string; ok?: boolean };

export async function createAccessRoleAction(
  _prev: AccessRoleState,
  formData: FormData,
): Promise<AccessRoleState> {
  await assertSameOrigin();
  const admin = await requireAdmin();

  const parsed = accessRoleNameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid name." };

  const existing = await prisma.accessRole.findUnique({ where: { name: parsed.data } });
  if (existing) return { error: "An access role with that name already exists." };

  await prisma.accessRole.create({ data: { name: parsed.data, permissionsJson: "[]" } });
  await audit("admin.accessrole.create", { userId: admin.id, detail: parsed.data });
  revalidatePath("/admin/access-roles");
  return { ok: true };
}

export async function renameAccessRoleAction(
  _prev: AccessRoleState,
  formData: FormData,
): Promise<AccessRoleState> {
  await assertSameOrigin();
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const parsed = accessRoleNameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid name." };

  const clash = await prisma.accessRole.findFirst({ where: { name: parsed.data, NOT: { id } } });
  if (clash) return { error: "Another access role already has that name." };

  await prisma.accessRole.update({ where: { id }, data: { name: parsed.data } });
  revalidatePath("/admin/access-roles");
  revalidatePath(`/admin/access-roles/${id}`);
  return { ok: true };
}

export async function setAccessRolePermissionsAction(
  _prev: AccessRoleState,
  formData: FormData,
): Promise<AccessRoleState> {
  await assertSameOrigin();
  const admin = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const role = await prisma.accessRole.findUnique({ where: { id } });
  if (!role) return { error: "Access role not found." };

  const permissions = sanitizePermissions(formData.getAll("permissions").map((v) => String(v)));

  await prisma.accessRole.update({
    where: { id },
    data: { permissionsJson: JSON.stringify(permissions) },
  });
  await audit("admin.accessrole.permissions.set", {
    userId: admin.id,
    detail: `${role.name}: ${permissions.length} capability(ies)`,
  });
  revalidatePath("/admin/access-roles");
  revalidatePath(`/admin/access-roles/${id}`);
  return { ok: true };
}

export async function deleteAccessRoleAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const role = await prisma.accessRole.findUnique({ where: { id } });
  if (!role) return;

  await prisma.accessRole.delete({ where: { id } }); // cascades user assignments
  await audit("admin.accessrole.delete", { userId: admin.id, detail: role.name });
  revalidatePath("/admin/access-roles");
  redirect("/admin/access-roles");
}
