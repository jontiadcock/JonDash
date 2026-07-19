import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { parsePermissionsJson } from "@/lib/auth/permissions";
import { CreateAccessRoleForm } from "./ui";

export const dynamic = "force-dynamic";

export default async function AccessRolesPage() {
  await requireAdmin();
  const roles = await prisma.accessRole.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true } } },
  });

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Access Roles</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Bundles of admin capabilities. Assign an access role to a user to delegate specific
          admin powers without making them a full admin. Only full admins can manage these.
        </p>
      </section>

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Create a new access role</h2>
        <CreateAccessRoleForm />
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--muted)" }} className="text-left">
                <th className="px-5 py-3 font-medium">Access role</th>
                <th className="px-5 py-3 font-medium">Capabilities</th>
                <th className="px-5 py-3 font-medium">Members</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-5 py-3 font-medium">{r.name}</td>
                  <td className="px-5 py-3">{parsePermissionsJson(r.permissionsJson).length}</td>
                  <td className="px-5 py-3">{r._count.users}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/access-roles/${r.id}`} className="btn btn-ghost !py-1.5 !px-3 text-sm">
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
              {roles.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center" style={{ color: "var(--muted)" }}>
                    No access roles yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
