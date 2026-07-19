import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { CreateRoleForm } from "@/app/admin/ui";

export const dynamic = "force-dynamic";

export default async function ServiceGroupsPage() {
  await requirePermission("groups.manage");
  const groups = await prisma.serviceRole.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { links: true, users: true } } },
  });

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Service Groups</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          A service group is a bundle of services. Assign a group to users and they all get its tiles.
        </p>
      </section>

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Create a new service group</h2>
        <CreateRoleForm />
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--muted)" }} className="text-left">
                <th className="px-5 py-3 font-medium">Group</th>
                <th className="px-5 py-3 font-medium">Services</th>
                <th className="px-5 py-3 font-medium">Members</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-5 py-3 font-medium">{g.name}</td>
                  <td className="px-5 py-3">{g._count.links}</td>
                  <td className="px-5 py-3">{g._count.users}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/service-groups/${g.id}`} className="btn btn-ghost !py-1.5 !px-3 text-sm">
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
              {groups.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center" style={{ color: "var(--muted)" }}>
                    No service groups yet.
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
