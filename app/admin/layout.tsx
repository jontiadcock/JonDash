import Link from "next/link";
import { requireAdminArea } from "@/lib/auth/guards";
import { logoutAction } from "@/app/(app)/actions";
import { UpdateBanner } from "./update-banner";
import { AdminNav } from "./admin-nav";
import { AdminSidebar } from "./admin-sidebar";
import { PageTransition } from "@/app/components/page-transition";
import { getAppVersion } from "@/lib/update";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user: admin, perms } = await requireAdminArea();
  const version = getAppVersion();
  const isAdmin = admin.role === "ADMIN";

  // Grouped "Settings" navigation. Each item is gated by a capability (or is
  // ADMIN-only); empty groups are dropped so a delegate sees only what they can use.
  const groups = [
    { label: null, items: [{ href: "/admin/settings", label: "General", show: perms.has("settings.manage") }] },
    {
      label: "Server settings",
      items: [
        { href: "/admin/updates", label: "Updates", show: perms.has("settings.manage") },
        { href: "/admin/backup", label: "Backup", show: perms.has("backups.manage") },
        { href: "/admin/network", label: "Network & HTTPS", show: perms.has("network.manage") },
        { href: "/admin/email", label: "Email", show: perms.has("email.manage") },
        { href: "/admin/modules", label: "Modules", show: perms.has("modules.manage") },
        { href: "/admin/helpers", label: "Helpers", show: perms.has("modules.manage") },
        { href: "/admin/server", label: "Server power", show: isAdmin },
      ],
    },
    {
      label: "Security",
      items: [
        { href: "/admin", label: "Users", show: perms.has("users.manage") || perms.has("users.reset") },
        { href: "/admin/service-groups", label: "Service Groups", show: perms.has("groups.manage") },
        { href: "/admin/sessions", label: "Sessions", show: perms.has("sessions.manage") },
        { href: "/admin/audit", label: "Audit", show: perms.has("audit.view") },
        { href: "/admin/access-roles", label: "Access Roles", show: isAdmin },
      ],
    },
  ]
    .map((g) => ({ label: g.label, items: g.items.filter((i) => i.show).map(({ href, label }) => ({ href, label })) }))
    .filter((g) => g.items.length > 0);

  // Flat list for the mobile dropdown (the desktop sidebar renders the groups).
  const flatItems = groups.flatMap((g) => g.items);

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="sticky top-0 z-10 border-b backdrop-blur"
        style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--background) 85%, transparent)" }}
      >
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link href="/admin" className="flex min-w-0 items-center gap-2 font-semibold">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
                J
              </span>
              <span className="truncate">
                JonDash<span className="hidden sm:inline"> Settings</span>
              </span>
            </Link>
            <span className="hidden text-xs sm:inline" style={{ color: "var(--muted)" }}>v{version}</span>
            {/* Mobile nav: the grouped sidebar is hidden below md, so surface a dropdown. */}
            <div className="md:hidden">
              <AdminNav items={flatItems} />
            </div>
          </div>
          <div className="flex flex-none items-center gap-2 sm:gap-3">
            <Link href="/dashboard" className="btn btn-ghost !py-1.5 !px-2.5 text-sm sm:!px-3">
              <span className="sm:hidden">Dashboard</span>
              <span className="hidden sm:inline">My dashboard</span>
            </Link>
            <span className="hidden text-sm sm:inline" style={{ color: "var(--muted)" }}>
              {admin.email}
            </span>
            <form action={logoutAction}>
              <button type="submit" className="btn btn-ghost !py-1.5 !px-2.5 text-sm sm:!px-3">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <UpdateBanner />

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-6 sm:py-8">
        <aside className="hidden w-52 flex-none md:block">
          <div className="sticky top-20">
            <div className="mb-3 px-3 text-sm font-semibold">Settings</div>
            <AdminSidebar groups={groups} />
          </div>
        </aside>
        <main className="min-w-0 flex-1">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
