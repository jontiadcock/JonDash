import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdminArea, firstPermittedAdminPath } from "@/lib/auth/guards";
import { ResetAccessForm, CreateLinkForm, ConfirmSubmit } from "@/app/admin/ui";
import {
  setUserStatusAction,
  deleteUserAction,
  setUserRolesAction,
  setUserAccessRolesAction,
} from "@/app/admin/actions";
import { LinkList } from "@/app/admin/link-list";

export const dynamic = "force-dynamic";

export default async function ManageUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user: admin, perms } = await requireAdminArea();
  // This page needs a user capability; a delegate without one is redirected.
  if (!perms.has("users.manage") && !perms.has("users.reset")) {
    redirect(firstPermittedAdminPath(perms));
  }
  const canManage = perms.has("users.manage");
  const canReset = perms.has("users.reset");
  const isFullAdmin = admin.role === "ADMIN";
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      links: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      serviceRoles: { select: { id: true } },
      accessRoles: { select: { id: true } },
    },
  });
  if (!user) notFound();

  const isSelf = user.id === admin.id;
  // A delegate (non-admin) can view but not act on an ADMIN account.
  const targetIsProtectedAdmin = user.role === "ADMIN" && !isFullAdmin;

  const allRoles = canManage
    ? await prisma.serviceRole.findMany({ orderBy: { name: "asc" } })
    : [];
  const assignedRoleIds = new Set(user.serviceRoles.map((r) => r.id));

  const allAccessRoles = isFullAdmin
    ? await prisma.accessRole.findMany({ orderBy: { name: "asc" } })
    : [];
  const assignedAccessRoleIds = new Set(user.accessRoles.map((r) => r.id));

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
        {targetIsProtectedAdmin ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            This is an admin account. Only a full admin can change it.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-start gap-3">
              {canReset && <ResetAccessForm userId={user.id} />}

              {canManage && !isSelf && (
                <form action={setUserStatusAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="disable" value={user.status === "DISABLED" ? "false" : "true"} />
                  <button type="submit" className="btn btn-ghost">
                    {user.status === "DISABLED" ? "Re-enable account" : "Disable account"}
                  </button>
                </form>
              )}

              {canManage && !isSelf && (
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
          </>
        )}
      </section>

      {/* Access roles (delegated admin) — full admin only */}
      {isFullAdmin && (
        <section className="card p-6">
          <h2 className="mb-1 text-lg font-semibold">Access Roles</h2>
          <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
            Grant this user specific admin powers without making them a full admin. Manage the
            roles themselves on the{" "}
            <Link href="/admin/access-roles" className="underline">
              Access Roles
            </Link>{" "}
            page.
          </p>
          {allAccessRoles.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No access roles exist yet.
            </p>
          ) : (
            <form action={setUserAccessRolesAction} className="flex flex-col gap-3">
              <input type="hidden" name="userId" value={user.id} />
              <div className="grid gap-2 sm:grid-cols-2">
                {allAccessRoles.map((r) => (
                  <label
                    key={r.id}
                    className="flex items-center gap-2 rounded-lg px-3 py-2"
                    style={{ background: "var(--surface-2)" }}
                  >
                    <input
                      type="checkbox"
                      name="accessRoleIds"
                      value={r.id}
                      defaultChecked={assignedAccessRoleIds.has(r.id)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">{r.name}</span>
                  </label>
                ))}
              </div>
              <div>
                <button type="submit" className="btn btn-primary text-sm">
                  Save access roles
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Service groups */}
      {canManage && (
        <section className="card p-6">
          <h2 className="mb-1 text-lg font-semibold">Service Groups</h2>
          <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
            Tick the service groups this user should have. They’ll see every service in each ticked group.
          </p>
          {allRoles.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No service groups exist yet. Create one from the{" "}
              <Link href="/admin/service-groups" className="underline">
                Service Groups
              </Link>{" "}
              page.
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
                  Save groups
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Add personal service */}
      {canManage && (
        <section className="card p-6">
          <h2 className="mb-1 text-lg font-semibold">Personal services</h2>
          <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
            Extra tiles just for this user, in addition to any from their service groups.
          </p>
          <CreateLinkForm userId={user.id} />
          <div className="mt-6">
            <LinkList links={user.links} />
          </div>
        </section>
      )}
    </div>
  );
}
