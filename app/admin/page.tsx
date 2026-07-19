import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdminArea, firstPermittedAdminPath } from "@/lib/auth/guards";
import { CreateUserForm } from "./ui";

export const dynamic = "force-dynamic";

const statusStyles: Record<string, string> = {
  ACTIVE: "var(--primary)",
  PENDING_SETUP: "#d97706",
  DISABLED: "var(--muted)",
};

export default async function AdminHome() {
  const { user: admin, perms } = await requireAdminArea();
  // The users list needs a user capability; a delegate without one is sent to
  // the first section they can actually see.
  if (!perms.has("users.manage") && !perms.has("users.reset")) {
    redirect(firstPermittedAdminPath(perms));
  }
  const canCreate = perms.has("users.manage");
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { links: true } }, serviceRoles: { select: { id: true } } },
  });

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Create accounts and manage each user’s services.
        </p>
      </section>

      {canCreate && (
        <section className="card p-6">
          <h2 className="mb-4 text-lg font-semibold">Create a new user</h2>
          <CreateUserForm isAdmin={admin.role === "ADMIN"} />
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--muted)" }} className="text-left">
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Access</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Groups</th>
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
    </div>
  );
}
