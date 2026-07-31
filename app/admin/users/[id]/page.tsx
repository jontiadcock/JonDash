import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isServiceAccount } from "@/lib/auth/service-accounts";
import { requireAdminArea, firstPermittedAdminPath } from "@/lib/auth/guards";
import { ResetAccessForm, CreateLinkForm, ConfirmSubmit } from "@/app/admin/ui";
import {
  setUserStatusAction,
  deleteUserAction,
  setUserRolesAction,
  setUserAccessRolesAction,
} from "@/app/admin/actions";
import { LinkList } from "@/app/admin/link-list";

/**
 * REFS lib/auth/service-accounts.ts · lib/auth/guards.ts · app/admin/ui.tsx · app/admin/actions.ts
 *      app/admin/link-list.tsx
 */

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
  const isService = isServiceAccount(user);
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
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {isService ? (user.displayName ?? user.email) : user.email}
        </h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {isService && "Service account · "}
          {user.role === "ADMIN" ? "Admin" : "User"} · {user.status.replace("_", " ").toLowerCase()}
        </p>
      </div>

      {/* SEC-07 — what an admin actually needs to know about a service account, and could not see
          at all in the first cut: what it is for, whether anything is still using it, and where
          its credential lives. An identity with no sign-in and no detail is indistinguishable
          from one that was created by mistake and forgotten. */}
      {isService && (
        <section className="card p-6">
          <h2 className="mb-1 text-lg font-semibold">How this account is used</h2>
          <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
            Nobody can sign in as this account. An add-on issues its own credential against it, and
            <strong> that credential lives in the add-on, not here</strong> — JonDash never sees it,
            cannot show it to you, and cannot re-issue it.
          </p>
          <p
            className="mb-4 rounded-lg p-3 text-sm"
            style={{ background: "var(--surface-2)" }}
          >
            <strong>To see, re-issue or revoke the key</strong>, open{" "}
            {user.lastUsedByHelper ? (
              <>
                the <strong>{user.lastUsedByHelper}</strong> add-on&apos;s own settings page
              </>
            ) : (
              <>the settings page of whichever add-on you pointed at this account</>
            )}
            , under{" "}
            <Link href="/admin/modules" style={{ color: "var(--primary)" }}>
              Addons
            </Link>
            . There is nothing to do on this page.
          </p>
          {/* No "credential type" here. It existed briefly and was withdrawn: a service account's
              credential is always something the add-on mints and holds, so labelling the identity
              described the add-on's plumbing — and one of the options ("username & password") could
              never be true, because a password would make this a login. */}
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt style={{ color: "var(--muted)" }}>Last used</dt>
              <dd className="mt-0.5 font-medium">
                {user.lastUsedAt ? user.lastUsedAt.toLocaleString() : "Never used"}
              </dd>
            </div>
            <div>
              <dt style={{ color: "var(--muted)" }}>Used by</dt>
              <dd className="mt-0.5 font-medium">{user.lastUsedByHelper ?? "—"}</dd>
            </div>
          </dl>
          {!user.lastUsedAt && (
            <p className="mt-4 text-sm" style={{ color: "var(--warning)" }}>
              No add-on has used this yet. Either it hasn&apos;t been pointed at one, or the add-on
              hasn&apos;t run since it was created.
            </p>
          )}
          <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
            <strong>To cut off every add-on at once</strong>, disable this account above. Add-ons
            re-check it on every request and stop immediately — you don&apos;t need to find each key.
          </p>
        </section>
      )}

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
              {/* Reset access is hidden for a service account: it clears a password and MFA and
                  issues a setup link, none of which exist here. The action refuses anyway, so a
                  visible button would be a control that looks like it works and doesn't. */}
              {canReset && !isService && <ResetAccessForm userId={user.id} />}

              {canManage && !isSelf && (
                <form action={setUserStatusAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="disable" value={user.status === "DISABLED" ? "false" : "true"} />
                  <button type="submit" className={isService && user.status !== "DISABLED" ? "btn btn-danger" : "btn btn-ghost"}>
                    {/* For a service account this IS the revocation control — every add-on
                        re-checks status per request and stops. Labelled for what it does rather
                        than what the column is called. */}
                    {user.status === "DISABLED"
                      ? isService ? "Re-enable — add-ons can use this again" : "Re-enable account"
                      : isService ? "Disable — cuts off every add-on" : "Disable account"}
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

      {/* Admin roles (delegated admin) — full admin only */}
      {isFullAdmin && (
        <section className="card p-6">
          <h2 className="mb-1 text-lg font-semibold">Admin Roles</h2>
          <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
            Grant this user specific admin powers without making them a full admin. Manage the
            roles themselves on the{" "}
            <Link href="/admin/access-roles" className="underline">
              Admin Roles
            </Link>{" "}
            page.
          </p>
          {/*
            BUG-57. `getEffectivePermissions` returns ALL_PERMISSIONS on its first line for an
            ADMIN, so every role assigned to one was silently ignored — while the tick-boxes
            saved, persisted and redrew as ticked. A control that appears to constrain a
            privileged account and does not is worse than no control at all.

            The stored rows are deliberately LEFT ALONE rather than cleared (owner decision,
            2026-07-27): demoting this account back to USER restores whatever was assigned,
            where clearing on save would silently discard it.
          */}
          {user.role === "ADMIN" || isService ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {user.role === "ADMIN"
                ? "This is an admin account, so it already holds every capability — an admin role could not add or remove anything. Change the account to a normal user to delegate specific powers instead."
                : "Admin roles don't apply to a service account. What it may do comes from the add-on holding its key, and from its account type."}
              {assignedAccessRoleIds.size > 0 && (
                <>
                  {" "}
                  {assignedAccessRoleIds.size} role
                  {assignedAccessRoleIds.size === 1 ? " is" : "s are"} still recorded against it and
                  will apply again if it becomes a normal user.
                </>
              )}
            </p>
          ) : allAccessRoles.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No admin roles exist yet.
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

      {/* Service groups — hidden for a service account (SEC-07): these decide which tiles appear
          on someone's DASHBOARD, and a service account has no dashboard because it has no
          session. Offering them implies a capability it does not have. */}
      {canManage && !isService && (
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

      {/* Personal services — hidden for a service account, same reason as service groups. */}
      {canManage && !isService && (
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
