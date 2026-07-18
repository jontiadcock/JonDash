import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { RenameRoleForm, CreateRoleLinkForm, ConfirmSubmit } from "@/app/admin/ui";
import { deleteRoleAction } from "@/app/admin/actions";
import { LinkList } from "@/app/admin/link-list";

export default async function ManageRolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const role = await prisma.serviceRole.findUnique({
    where: { id },
    include: {
      links: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      users: { orderBy: { email: "asc" }, select: { id: true, email: true } },
    },
  });
  if (!role) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin" className="text-sm" style={{ color: "var(--muted)" }}>
          ← Back to admin
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{role.name}</h1>
          <div className="flex items-center gap-2">
            <RenameRoleForm role={{ id: role.id, name: role.name }} />
            <form action={deleteRoleAction}>
              <input type="hidden" name="id" value={role.id} />
              <ConfirmSubmit
                className="btn btn-danger"
                message={`Delete the “${role.name}” role? Its services will be removed from everyone who has this role.`}
              >
                Delete role
              </ConfirmSubmit>
            </form>
          </div>
        </div>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {role.links.length} service(s) · {role.users.length} member(s)
        </p>
      </div>

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Add a service to this role</h2>
        <CreateRoleLinkForm roleId={role.id} />
      </section>

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Services in this role ({role.links.length})</h2>
        <LinkList links={role.links} />
      </section>

      <section className="card p-6">
        <h2 className="mb-2 text-lg font-semibold">Members ({role.users.length})</h2>
        {role.users.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No one has this role yet. Assign it from a user’s page.
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
