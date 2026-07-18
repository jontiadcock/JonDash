import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { CreateUserForm, CreateRoleForm } from "./ui";

const statusStyles: Record<string, string> = {
  ACTIVE: "var(--primary)",
  PENDING_SETUP: "#d97706",
  DISABLED: "var(--muted)",
};

export default async function AdminHome() {
  const admin = await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { links: true } }, serviceRoles: { select: { id: true } } },
  });
  const roles = await prisma.serviceRole.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { links: true, users: true } } },
  });

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Create accounts and manage each user’s services.
        </p>
      </section>

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Create a new user</h2>
        <CreateUserForm />
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--muted)" }} className="text-left">
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Access</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Roles</th>
                <th className="px-5 py-3 font-medium">Tiles</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-5 py-3 font-medium">
                    {u.email}
                    {u.id === admin.id && (
                      <span
                        className="ml-2 rounded px-1.5 py-0.5 text-xs"
                        style={{ background: "var(--surface-2)", color: "var(--muted)" }}
                      >
                        You
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">{u.role === "ADMIN" ? "Admin" : "User"}</td>
                  <td className="px-5 py-3">
                    <span style={{ color: statusStyles[u.status] }}>
                      {u.status.replace("_", " ").toLowerCase()}
                    </span>
                  </td>
                  <td className="px-5 py-3">{u.serviceRoles.length}</td>
                  <td className="px-5 py-3">{u._count.links}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/users/${u.id}`} className="btn btn-ghost !py-1.5 !px-3 text-sm">
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center" style={{ color: "var(--muted)" }}>
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-2xl font-semibold tracking-tight">Roles</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          A role is a bundle of services. Assign a role to users and they all get its tiles.
        </p>
      </section>

      <section className="card p-6">
        <h3 className="mb-4 text-lg font-semibold">Create a new role</h3>
        <CreateRoleForm />
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--muted)" }} className="text-left">
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Services</th>
                <th className="px-5 py-3 font-medium">Members</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-5 py-3 font-medium">{r.name}</td>
                  <td className="px-5 py-3">{r._count.links}</td>
                  <td className="px-5 py-3">{r._count.users}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/roles/${r.id}`} className="btn btn-ghost !py-1.5 !px-3 text-sm">
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
              {roles.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center" style={{ color: "var(--muted)" }}>
                    No roles yet.
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
