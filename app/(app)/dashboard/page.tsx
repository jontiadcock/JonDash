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
  packLayout,
  GEOMETRY,
  PROFILES,
  type DashboardProfile,
} from "@/lib/dashboard/layout";
import { DashboardGrid, type DashboardItem, type ProfileArrangement } from "./dashboard-grid";

export default async function DashboardPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const links = await getUserVisibleLinks(user.id);

  /*
   * ⚠ Migrate before rendering: a module updated at the last restart may ship new migrations, and
   * its widget would otherwise query the old schema. Memoised, so this is a no-op after the first.
   * REFS lib/modules/manage.ts › ensureModuleMigrations()
   *      lib/modules/visibility.ts › visibleModuleIds() — the adminOnly + Service Group filter
   */
  await ensureModuleMigrations();
  const visible = await visibleModuleIds({ id: user.id, role: user.role as "ADMIN" | "USER" });
  const allowedWidgets = (await getEnabledModules()).filter(
    (s) => s.def.DashboardWidget && (!s.def.adminOnly || isAdmin) && visible.has(s.def.id),
  );

  /*
   * ONE list, tiles and widgets together (CORE-11). ⚠ Each is rendered HERE and handed to the grid
   * as a node — a widget is a server component that may query — so the grid can reorder either
   * kind without it becoming client code. REFS ./dashboard-grid.tsx › DashboardItem
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
        // Only where the module actually has a page — a card that looks clickable and does
        // nothing is worse than one that plainly isn't.
        href: s.def.Page ? `/m/${s.def.id}` : null,
        external: false,
        node: <Widget ctx={ctx} />,
      };
    }),
  ];

  /*
   * BOTH profiles are computed server-side and sent down (CORE-12) — which one applies depends on
   * the viewport, which the server cannot see. Sending both lets the client switch with no round
   * trip, so rotating a phone or crossing the breakpoint is instant.
   *
   * ⚠ Known limit: the server renders `wide`, and a narrow client corrects on mount — so someone
   * whose two arrangements have diverged sees one reflow on first load. A cookie would cost a
   * round trip and be wrong for the visit that set it.
   * REFS ./dashboard-grid.tsx — does that correction · lib/dashboard/geometry.ts › PROFILES
   */
  const arrangements = {} as Record<DashboardProfile, ProfileArrangement>;
  for (const profile of PROFILES) {
    const layout = await getUserLayout(user.id, profile);
    /*
     * ⚠ Every item gets a concrete cell HERE, on the server. Leaving it to CSS auto-placement
     * would mean the browser and the server disagree about which cells are occupied, and a drag
     * could no longer test a candidate cell for collisions without measuring the DOM.
     * REFS lib/dashboard/geometry.ts › packLayout() — the packing rule itself
     */
    const ordered = applyLayoutOrder(items, layout);
    const placements = packLayout(
      ordered.map((i) => {
        const span = spanFor(i.kind, i.id, profile, layout);
        const saved = layout.get(`${i.kind}:${i.id}`);
        return { kind: i.kind, id: i.id, ...span, col: saved?.col ?? null, row: saved?.row ?? null };
      }),
      GEOMETRY[profile].columns,
    );
    arrangements[profile] = {
      order: ordered.map((i) => ({ kind: i.kind, id: i.id })),
      placements: Object.fromEntries(placements),
    };
  }

  return (
    // `data-wide-page` releases the shell's reading measure (CORE-14) — a grid has no line
    // length to protect. REFS app/(app)/layout.tsx — the only reader of this attribute
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
        /* ⚠ Keyed on the SET of items, sorted so a reorder is not a new key: adding or removing
           one re-seeds the grid, rearranging keeps it mounted and keeps the optimistic order. */
        <DashboardGrid
          key={items.map((i) => `${i.kind}:${i.id}`).sort().join(",")}
          items={items}
          arrangements={arrangements}
        />
      )}
    </div>
  );
}
