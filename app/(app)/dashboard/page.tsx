import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { getUserVisibleLinks } from "@/lib/services";
import { ServiceTile } from "@/app/components/service-tile";

export default async function DashboardPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const links = await getUserVisibleLinks(user.id);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your services</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Quick access to everything set up for you.
          </p>
        </div>
        {isAdmin && (
          <Link href={`/admin/users/${user.id}`} className="btn btn-primary text-sm">
            + Manage my services
          </Link>
        )}
      </div>

      {links.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <p className="font-medium">No services yet</p>
          {isAdmin ? (
            <>
              <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                Add your own service tiles, or set them up for other people from the Admin area.
              </p>
              <Link href={`/admin/users/${user.id}`} className="btn btn-primary mt-4 text-sm">
                + Add my first service
              </Link>
            </>
          ) : (
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              Your administrator hasn’t added any services to your dashboard.
            </p>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {links.map((link) => (
            <li key={link.id}>
              <ServiceTile
                title={link.title}
                url={link.url}
                iconSrc={
                  link.iconPath
                    ? `/api/icons/${link.id}?v=${link.updatedAt.getTime()}`
                    : null
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
