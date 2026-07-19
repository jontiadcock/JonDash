import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { RenameRoleForm, CreateRoleLinkForm, ConfirmSubmit } from "@/app/admin/ui";
import { deleteRoleAction } from "@/app/admin/actions";
import { LinkList } from "@/app/admin/link-list";

export default async function ManageServiceGroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("groups.manage");
  const { id } = await params;

  const group = await prisma.serviceRole.findUnique({
    where: { id },
    include: {
      links: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      users: { orderBy: { email: "asc" }, select: { id: true, email: true } },
    },
  });
  if (!group) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/service-groups" className="text-sm" style={{ color: "var(--muted)" }}>
          ← Back to service groups
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
          <div className="flex items-center gap-2">
            <RenameRoleForm role={{ id: group.id, name: group.name }} />
            <form action={deleteRoleAction}>
              <input type="hidden" name="id" value={group.id} />
              <ConfirmSubmit
                className="btn btn-danger"
                message={`Delete the “${group.name}” service group? Its services will be removed from everyone who has this group.`}
              >
                Delete group
              </ConfirmSubmit>
            </form>
          </div>
        </div>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {group.links.length} service(s) · {group.users.length} member(s)
        </p>
      </div>

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Add a service to this group</h2>
        <CreateRoleLinkForm roleId={group.id} />
      </section>

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Services in this group ({group.links.length})</h2>
        <LinkList links={group.links} />
      </section>

      <section className="card p-6">
        <h2 className="mb-2 text-lg font-semibold">Members ({group.users.length})</h2>
        {group.users.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No one has this group yet. Assign it from a user’s page.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {group.users.map((u) => (
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
