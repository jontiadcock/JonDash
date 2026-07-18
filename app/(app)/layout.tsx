import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { logoutAction } from "./actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="sticky top-0 z-10 border-b backdrop-blur"
        style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--background) 85%, transparent)" }}
      >
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
              J
            </span>
            JonDash
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/account" className="btn btn-ghost !py-1.5 !px-3 text-sm">
              Account
            </Link>
            {user.role === "ADMIN" && (
              <Link href="/admin" className="btn btn-ghost !py-1.5 !px-3 text-sm">
                Admin
              </Link>
            )}
            <span className="hidden text-sm sm:inline" style={{ color: "var(--muted)" }}>
              {user.email}
            </span>
            <form action={logoutAction}>
              <button type="submit" className="btn btn-ghost !py-1.5 !px-3 text-sm">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
