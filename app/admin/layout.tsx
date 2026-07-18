import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";
import { logoutAction } from "@/app/(app)/actions";
import { UpdateBanner } from "./update-banner";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="sticky top-0 z-10 border-b backdrop-blur"
        style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--background) 85%, transparent)" }}
      >
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
                J
              </span>
              JonDash Admin
            </div>
            <nav className="hidden items-center gap-1 sm:flex">
              <Link href="/admin" className="btn btn-ghost !py-1.5 !px-3 text-sm">
                Users
              </Link>
              <Link href="/admin/sessions" className="btn btn-ghost !py-1.5 !px-3 text-sm">
                Sessions
              </Link>
              <Link href="/admin/backup" className="btn btn-ghost !py-1.5 !px-3 text-sm">
                Backup
              </Link>
            </nav>
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
