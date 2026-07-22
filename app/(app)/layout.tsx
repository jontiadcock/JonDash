import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { PageTransition } from "@/app/components/page-transition";
import { logoutAction } from "./actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  // Full admins and delegates (users holding at least one admin capability via an
  // access role) get a link into the admin area.
  const canAccessAdmin = (await getEffectivePermissions(user)).size > 0;

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="sticky top-0 z-10 border-b backdrop-blur"
        style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--background) 85%, transparent)" }}
      >
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-3 sm:px-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
              J
            </span>
            <span className="truncate">JonDash</span>
          </Link>
          <div className="flex flex-none items-center gap-2 sm:gap-3">
            <Link href="/account" className="btn btn-ghost !py-1.5 !px-2.5 text-sm sm:!px-3">
              Account
            </Link>
            {canAccessAdmin && (
              <Link href="/admin" className="btn btn-ghost !py-1.5 !px-2.5 text-sm sm:!px-3">
                Admin
              </Link>
            )}
            <span className="hidden text-sm sm:inline" style={{ color: "var(--muted)" }}>
              {user.email}
            </span>
            <form action={logoutAction}>
              <button type="submit" className="btn btn-ghost !py-1.5 !px-2.5 text-sm sm:!px-3">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
