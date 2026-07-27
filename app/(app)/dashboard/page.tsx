import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { getUserVisibleLinks } from "@/lib/services";
import { ServiceTile } from "@/app/components/service-tile";
import { getEnabledModules } from "@/lib/modules/registry";
import { buildModuleContext } from "@/lib/modules/context";
import { visibleModuleIds } from "@/lib/modules/visibility";
import { ensureModuleMigrations } from "@/lib/modules/manage";
import {
  getUserLayout,
  applyLayoutOrder,
  spanFor,
  PROFILES,
  type DashboardProfile,
} from "@/lib/dashboard/layout";
import { DashboardGrid, type DashboardItem, type ProfileArrangement } from "./dashboard-grid";

export default async function DashboardPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const links = await getUserVisibleLinks(user.id);

  // Enabled modules with a widget, limited to what this user may see: adminOnly modules
  // are admin-only, and a module assigned to Service Groups only shows to their members.
  // A module updated in the last restart may ship new migrations; apply them before its
  // widget renders against the old schema. Memoised, so this is a no-op after the first.
  await ensureModuleMigrations();
  const visible = await visibleModuleIds({ id: user.id, role: user.role as "ADMIN" | "USER" });
  const allowedWidgets = (await getEnabledModules()).filter(
    (s) => s.def.DashboardWidget && (!s.def.adminOnly || isAdmin) && visible.has(s.def.id),
  );

  /*
   * ONE list, tiles and widgets together (CORE-11). Each is rendered here — a widget is a
   * server component that may query, and a tile needs the icon URL — and handed to the grid
   * as a node, so the grid can reorder without either becoming client code.
   */
  const items: DashboardItem[] = [
    ...links.map((link) => ({
      kind: "link" as const,
      id: link.id,
      name: link.title,
      href: link.url,
      external: true,
      node: (
        <ServiceTile
          title={link.title}
          url={link.url}
          iconSrc={link.iconPath ? `/api/icons/${link.id}?v=${link.updatedAt.getTime()}` : null}
        />
      ),
    })),
    ...allowedWidgets.map((s) => {
      const Widget = s.def.DashboardWidget!;
      const ctx = buildModuleContext(s.def, s.granted, {
        id: user.id,
        email: user.email,
        role: user.role,
      });
      return {
        kind: "module" as const,
        id: s.def.id,
        name: s.def.name,
        // Clicking opens the module's own page — but only where there is one. A card that
        // looks clickable and does nothing is worse than one that plainly isn't.
        href: s.def.Page ? `/m/${s.def.id}` : null,
        external: false,
        node: <Widget ctx={ctx} />,
      };
    }),
  ];

  /*
   * BOTH profiles are computed server-side and sent down (CORE-12).
   *
   * Which one applies is a client fact — it depends on the viewport, which the server cannot
   * see. Sending both means the client can switch without a round trip, and rotating a phone
   * or dragging a window across the breakpoint is instant.
   *
   * **Honest limit:** the server has to render *something*, and it renders `wide`. A narrow
   * client corrects on mount, so someone whose two arrangements have actually diverged sees one
   * reflow on first load. The alternative — a cookie carrying the profile — costs a round trip
   * on first visit and is wrong for the visit where it was set. Since both profiles start
   * identical (the migration copies one into the other), the reflow only appears once someone
   * has deliberately made them differ, which is exactly when they would expect two layouts.
   */
  const arrangements = {} as Record<DashboardProfile, ProfileArrangement>;
  for (const profile of PROFILES) {
    const layout = await getUserLayout(user.id, profile);
    const ordered = applyLayoutOrder(items, layout);
    arrangements[profile] = {
      order: ordered.map((i) => ({ kind: i.kind, id: i.id })),
      spans: Object.fromEntries(
        ordered.map((i) => [`${i.kind}:${i.id}`, spanFor(i.kind, i.id, profile, layout)]),
      ),
    };
  }

  return (
    // `data-wide-page` releases the shell's reading measure (CORE-14) — see app/(app)/layout.tsx.
    // A dashboard is a grid, not prose: it has no line length to protect and simply wants the
    // screen it was given.
    <div data-wide-page>
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

      {items.length === 0 ? (
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
        /* Keyed on the SET of items (sorted, so a reorder isn't a new key): adding or removing
           one re-seeds the grid; rearranging leaves it mounted and keeps the optimistic order. */
        <DashboardGrid
          key={items.map((i) => `${i.kind}:${i.id}`).sort().join(",")}
          items={items}
          arrangements={arrangements}
        />
      )}
    </div>
  );
}
