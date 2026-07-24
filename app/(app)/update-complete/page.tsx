import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { getAppVersion } from "@/lib/update";
import { AutoContinue } from "./auto-continue";

export const dynamic = "force-dynamic";

/**
 * Shown after an in-place update. The overlay sends the admin here once the new build is up
 * — and because an update now keeps the session (lib/boot SESSION_EPOCH), they arrive still
 * signed in, rather than being bounced to /login. A restart still lands on /login.
 */
export default async function UpdateCompletePage() {
  await requireUser();
  const version = getAppVersion();

  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-5 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: "color-mix(in srgb, #16a34a 16%, transparent)", color: "#16a34a" }}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12 5 5L20 7" />
        </svg>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Update successful</h1>
        <p className="mx-auto mt-1.5 max-w-sm text-sm" style={{ color: "var(--muted)" }}>
          JonDash is now running <strong style={{ color: "var(--foreground)" }}>v{version}</strong>. You
          stayed signed in — no need to log back in.
        </p>
      </div>
      <Link href="/dashboard" className="btn btn-primary text-sm">
        Continue to dashboard
      </Link>
      <AutoContinue to="/dashboard" afterMs={6000} />
    </div>
  );
}
