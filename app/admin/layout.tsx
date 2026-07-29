import Link from "next/link";
import { requireAdminArea } from "@/lib/auth/guards";
import { UpdateBanner } from "./update-banner";
import { AdminNav } from "./admin-nav";
import { AdminSidebar } from "./admin-sidebar";
import { PageTransition } from "@/app/components/page-transition";
import { UserMenu } from "@/app/components/user-menu";
import { BrandMark } from "@/app/components/branding";
import { getAppVersion } from "@/lib/update";
import { SupportBanner, SupportLine } from "@/app/components/support";
import { installedDaysAgo } from "@/lib/install-age";
import { getUserFlag, USER_FLAG } from "@/lib/user-prefs";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user: admin, perms } = await requireAdminArea();
  const version = getAppVersion();
  const installedDays = await installedDaysAgo();
  // Per user, not per browser — dismissing on a phone must be remembered on a desktop (BUG-74).
  const bannerDismissed = await getUserFlag(admin.id, USER_FLAG.supportBannerDismissed);
  const isAdmin = admin.role === "ADMIN";

  // Grouped "Settings" navigation. Each item is gated by a capability (or is
  // ADMIN-only); empty groups are dropped so a delegate sees only what they can use.
  const groups = [
    {
      label: null,
      items: [
        { href: "/admin/settings", label: "General", show: perms.has("settings.manage") },
        // Directly below General, at the owner's request (11.1) — not at the foot of the list.
        // Help is what you reach for when something is wrong, and hunting for it past nine
        // sections of settings is the moment it is least wanted. Ungated: everyone who can see
        // this area can ask for help.
        { href: "/help-meeeee", label: "Help & support", show: true },
      ],
    },
    {
      label: "Server settings",
      items: [
        { href: "/admin/updates", label: "Updates", show: perms.has("settings.manage") },
        { href: "/admin/backup", label: "Backup", show: perms.has("backups.manage") },
        { href: "/admin/network", label: "Network & HTTPS", show: perms.has("network.manage") },
        { href: "/admin/email", label: "Email", show: perms.has("email.manage") },
        // One entry, not two. Helpers were never separately manageable — they arrive with a
        // module that needs them and leave when nothing does — so a second nav item implied a
        // control that did not exist. They now live in a section of this page instead.
        { href: "/admin/modules", label: "Addons", show: perms.has("modules.manage") },
        { href: "/admin/server", label: "Server power", show: isAdmin },
      ],
    },
    {
      label: "Security",
      items: [
        // Under Security, not beside Modules: the question it answers — "what can reach my
        // files?" — is a security question, and it spans every module rather than belonging
        // to any one of them.
        // "Addon Permissions", not "Permissions": this page is entirely about what an ADD-ON may
        // do, and sat one line above "Access Roles", which is about what a PERSON may do. Two
        // unrelated things, near-identical names. Renaming both is what separates them.
        { href: "/admin/permissions", label: "Addon Permissions", show: perms.has("modules.manage") },
        { href: "/admin", label: "Users", show: perms.has("users.manage") || perms.has("users.reset") },
        { href: "/admin/service-groups", label: "Service Groups", show: perms.has("groups.manage") },
        // Directly under Service Groups: both answer "what is this PERSON allowed to reach?",
        // one for services and one for admin capabilities, so they belong next to each other.
        { href: "/admin/access-roles", label: "Admin Roles", show: isAdmin },
        { href: "/admin/sessions", label: "Sessions", show: perms.has("sessions.manage") },
        { href: "/admin/audit", label: "Audit", show: perms.has("audit.view") },
      ],
    },
  ]
    .map((g) => ({ label: g.label, items: g.items.filter((i) => i.show).map(({ href, label }) => ({ href, label })) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="sticky top-0 z-10 border-b backdrop-blur"
        style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--background) 85%, transparent)" }}
      >
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link href="/admin" className="flex min-w-0 items-center gap-2 font-semibold">
              <BrandMark suffix={<span className="hidden sm:inline"> Settings</span>} />
            </Link>
            <span className="hidden text-xs sm:inline" style={{ color: "var(--muted)" }}>v{version}</span>
            {/* Mobile nav: the grouped sidebar is hidden below md, so surface a hamburger
                that slides the same grouped nav out from the left. */}
            <div className="md:hidden">
              <AdminNav groups={groups} />
            </div>
          </div>
          <div className="flex flex-none items-center gap-2 sm:gap-3">
            <Link href="/dashboard" className="btn btn-ghost !py-1.5 !px-2.5 text-sm sm:!px-3">
              <span className="sm:hidden">Dashboard</span>
              <span className="hidden sm:inline">My dashboard</span>
            </Link>
            <UserMenu email={admin.email} />
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
          <SupportBanner installedDays={installedDays} dismissed={bannerDismissed} />
          <PageTransition>{children}</PageTransition>
          <div className="mt-8 text-center">
            <SupportLine />
          </div>
        </main>
      </div>
    </div>
  );
}
