import Link from "next/link";
import { requireAdminArea } from "@/lib/auth/guards";
import { logoutAction } from "@/app/(app)/actions";
import { UpdateBanner } from "./update-banner";
import { AdminNav } from "./admin-nav";
import { getAppVersion } from "@/lib/update";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user: admin, sections } = await requireAdminArea();
  const version = getAppVersion();

  // "Access Roles" and "Network & HTTPS" management are full-admin only.
  const navItems =
    admin.role === "ADMIN"
      ? [
          ...sections,
          { href: "/admin/access-roles", label: "Access Roles" },
          { href: "/admin/network", label: "Network & HTTPS" },
        ]
      : sections;

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="sticky top-0 z-10 border-b backdrop-blur"
        style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--background) 85%, transparent)" }}
      >
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="flex items-center gap-2 font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
                J
              </span>
              JonDash Admin
            </Link>
            <span className="text-xs" style={{ color: "var(--muted)" }}>v{version}</span>
            <AdminNav items={navItems} />
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="btn btn-ghost !py-1.5 !px-3 text-sm">
              My dashboard
            </Link>
            <span className="hidden text-sm sm:inline" style={{ color: "var(--muted)" }}>
              {admin.email}
            </span>
            <form action={logoutAction}>
              <button type="submit" className="btn btn-ghost !py-1.5 !px-3 text-sm">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <UpdateBanner />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
