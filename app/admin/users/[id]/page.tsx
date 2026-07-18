import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { ResetAccessForm, CreateLinkForm, ConfirmSubmit } from "@/app/admin/ui";
import {
  setUserStatusAction,
  deleteUserAction,
  setUserRolesAction,
} from "@/app/admin/actions";
import { LinkList } from "@/app/admin/link-list";

export default async function ManageUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      links: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      serviceRoles: { select: { id: true } },
    },
  });
  if (!user) notFound();

  const allRoles = await prisma.serviceRole.findMany({ orderBy: { name: "asc" } });
  const assignedRoleIds = new Set(user.serviceRoles.map((r) => r.id));
  const isSelf = user.id === admin.id;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin" className="text-sm" style={{ color: "var(--muted)" }}>
          ← Back to users
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{user.email}</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {user.role === "ADMIN" ? "Admin" : "User"} · {user.status.replace("_", " ").toLowerCase()}
        </p>
      </div>

      {/* Account controls */}
      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Account</h2>
        <div className="flex flex-wrap items-start gap-3">
          <ResetAccessForm userId={user.id} />

          {!isSelf && (
            <form action={setUserStatusAction}>
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="disable" value={user.status === "DISABLED" ? "false" : "true"} />
              <button type="submit" className="btn btn-ghost">
                {user.status === "DISABLED" ? "Re-enable account" : "Disable account"}
              </button>
            </form>
          )}

          {!isSelf && (
            <form action={deleteUserAction}>
              <input type="hidden" name="userId" value={user.id} />
              <ConfirmSubmit
                className="btn btn-danger"
                message="Permanently delete this user and all their services? This cannot be undone."
              >
                Delete user
              </ConfirmSubmit>
            </form>
          )}
        </div>
        {isSelf && (
          <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
            You cannot disable or delete your own account.
          </p>
        )}
      </section>

      {/* Roles */}
      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Roles</h2>
        <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
          Tick the roles this user should have. They’ll see every service in each ticked role.
        </p>
        {allRoles.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No roles exist yet. Create one from the{" "}
            <Link href="/admin" className="underline">
              admin home page
            </Link>
            .
          </p>
        ) : (
          <form action={setUserRolesAction} className="flex flex-col gap-3">
            <input type="hidden" name="userId" value={user.id} />
            <div className="grid gap-2 sm:grid-cols-2">
              {allRoles.map((r) => (
                <label
                  key={r.id}
                  className="flex items-center gap-2 rounded-lg px-3 py-2"
                  style={{ background: "var(--surface-2)" }}
                >
                  <input
                    type="checkbox"
                    name="roleIds"
                    value={r.id}
                    defaultChecked={assignedRoleIds.has(r.id)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">{r.name}</span>
                </label>
              ))}
            </div>
            <div>
              <button type="submit" className="btn btn-primary text-sm">
                Save roles
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Add personal service */}
      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Personal services</h2>
        <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
          Extra tiles just for this user, in addition to any from their roles.
        </p>
        <CreateLinkForm userId={user.id} />
        <div className="mt-6">
          <LinkList links={user.links} />
        </div>
      </section>
    </div>
  );
}
