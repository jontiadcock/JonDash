import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdminArea, firstPermittedAdminPath } from "@/lib/auth/guards";
import { CreateUserForm, CreateServiceAccountForm } from "./ui";

export const dynamic = "force-dynamic";

const statusStyles: Record<string, string> = {
  ACTIVE: "var(--primary)",
  PENDING_SETUP: "var(--warning)",
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
        <div className="grid gap-6 md:grid-cols-2">
          <section className="card p-6">
            <h2 className="mb-4 text-lg font-semibold">Create a new user</h2>
            <CreateUserForm isAdmin={admin.role === "ADMIN"} />
          </section>
          {/* Alongside creating a user, not hidden behind it (SEC-07). A service account is a
              different kind of thing, so it gets its own card rather than a checkbox on the user
              form — a flag there is one someone eventually ticks by mistake. */}
          <section className="card p-6">
            <h2 className="mb-1 text-lg font-semibold">Create a service account</h2>
            <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
              An identity for an add-on to act as — it can hold permissions and appears in the audit
              log, but <strong>nobody can ever sign in as it</strong>. No password, no authenticator,
              no reset link.
            </p>
            <CreateServiceAccountForm isAdmin={admin.role === "ADMIN"} />
          </section>
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--muted)" }} className="text-left">
                <th className="px-5 py-3 font-medium">Name</th>
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
                    {/* A service account shows its NAME, never its generated handle — the handle is
                        internal plumbing and showing it invites someone to treat it as an address.
                        The badge is not decoration: "visibly a service account wherever users are
                        listed" is part of the guarantee, so this must never read as a person with
                        an odd name (SEC-07). */}
                    {u.isServiceAccount ? (u.displayName ?? u.email) : u.email}
                    {u.isServiceAccount && (
                      <span
                        className="ml-2 rounded px-1.5 py-0.5 text-xs font-semibold"
                        style={{ background: "color-mix(in srgb, var(--primary) 16%, transparent)", color: "var(--primary)" }}
                      >
                        Service account
                      </span>
                    )}
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
