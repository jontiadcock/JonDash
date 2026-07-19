import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { PERMISSIONS, ALL_PERMISSIONS, parsePermissionsJson } from "@/lib/auth/permissions";
import { ConfirmSubmit } from "@/app/admin/ui";
import { RenameAccessRoleForm, AccessRolePermissionsForm } from "../ui";
import { deleteAccessRoleAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ManageAccessRolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const role = await prisma.accessRole.findUnique({
    where: { id },
    include: { users: { orderBy: { email: "asc" }, select: { id: true, email: true } } },
  });
  if (!role) notFound();

  const assigned = parsePermissionsJson(role.permissionsJson);
  const permissionList = ALL_PERMISSIONS.map((key) => ({ key, label: PERMISSIONS[key] }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/access-roles" className="text-sm" style={{ color: "var(--muted)" }}>
          ← Back to access roles
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{role.name}</h1>
          <div className="flex items-center gap-2">
            <RenameAccessRoleForm role={{ id: role.id, name: role.name }} />
            <form action={deleteAccessRoleAction}>
              <input type="hidden" name="id" value={role.id} />
              <ConfirmSubmit
                className="btn btn-danger"
                message={`Delete the “${role.name}” access role? Everyone assigned it will lose these capabilities.`}
              >
                Delete access role
              </ConfirmSubmit>
            </form>
          </div>
        </div>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {assigned.length} capability(ies) · {role.users.length} member(s)
        </p>
      </div>

      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Capabilities</h2>
        <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
          Tick the admin powers this access role grants.
        </p>
        <AccessRolePermissionsForm roleId={role.id} permissions={permissionList} assigned={assigned} />
      </section>

      <section className="card p-6">
        <h2 className="mb-2 text-lg font-semibold">Members ({role.users.length})</h2>
        {role.users.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No one has this access role yet. Assign it from a user’s page.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {role.users.map((u) => (
              <li key={u.id}>
                <Link
                  href={`/admin/users/${u.id}`}
                  className="inline-block rounded-lg px-3 py-1.5 text-sm"
                  style={{ background: "var(--surface-2)" }}
                >
                  {u.email}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
