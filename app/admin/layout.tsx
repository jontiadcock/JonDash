import Link from "next/link";
import { requireAdminArea } from "@/lib/auth/guards";
import { logoutAction } from "@/app/(app)/actions";
import { UpdateBanner } from "./update-banner";
import { AdminNav } from "./admin-nav";
import { PageTransition } from "@/app/components/page-transition";
import { getAppVersion } from "@/lib/update";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user: admin, sections } = await requireAdminArea();
  const version = getAppVersion();

  // "Access Roles", "Network & HTTPS" and "Email" management are full-admin only.
  const navItems =
    admin.role === "ADMIN"
      ? [
          ...sections,
          { href: "/admin/access-roles", label: "Access Roles" },
          { href: "/admin/network", label: "Network & HTTPS" },
          { href: "/admin/email", label: "Email" },
        ]
      : sections;

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
                JonDash<span className="hidden sm:inline"> Admin</span>
              </span>
            </Link>
            <span className="hidden text-xs sm:inline" style={{ color: "var(--muted)" }}>v{version}</span>
            <AdminNav items={navItems} />
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
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
