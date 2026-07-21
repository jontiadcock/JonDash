import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { getUserVisibleLinks } from "@/lib/services";
import { ServiceTile } from "@/app/components/service-tile";
import { getEnabledModules } from "@/lib/modules/registry";
import { buildModuleContext } from "@/lib/modules/context";
import { visibleModuleIds } from "@/lib/modules/visibility";
import { getUserModuleLayout, applyLayoutOrder } from "@/lib/modules/layout";
import { WidgetFrame } from "./widget-frame";

export default async function DashboardPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const links = await getUserVisibleLinks(user.id);

  // Enabled modules with a widget, limited to what this user may see: adminOnly modules
  // are admin-only, and a module assigned to Service Groups only shows to their members.
  const visible = await visibleModuleIds({ id: user.id, role: user.role as "ADMIN" | "USER" });
  const allowedWidgets = (await getEnabledModules()).filter(
    (s) => s.def.DashboardWidget && (!s.def.adminOnly || isAdmin) && visible.has(s.def.id),
  );
  // Each user arranges their own dashboard; without a saved layout nothing changes.
  const layout = await getUserModuleLayout(user.id);
  const widgets = applyLayoutOrder(allowedWidgets, layout);
  const orderedIds = widgets.map((s) => s.def.id);

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

      {widgets.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Modules</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {widgets.map((s) => {
              const Widget = s.def.DashboardWidget!;
              const ctx = buildModuleContext(s.def, s.granted, {
                id: user.id,
                email: user.email,
                role: user.role,
              });
              const size = layout.get(s.def.id);
              return (
                <WidgetFrame
                  key={s.def.id}
                  moduleId={s.def.id}
                  name={s.def.name}
                  width={size?.width ?? 1}
                  height={size?.height ?? 1}
                  orderedIds={orderedIds}
                >
                  <Widget ctx={ctx} />
                </WidgetFrame>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
