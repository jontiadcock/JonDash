import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { getAppVersion } from "@/lib/update";
import { AutoContinue } from "./auto-continue";
import { ContinueAddons } from "./continue-addons";
import { hasQueuedAddonUpdates } from "@/lib/update-queue";

export const dynamic = "force-dynamic";

/**
 * Shown after an in-place update. The admin arrives still signed in, because an update keeps the
 * session; a plain restart or module rebuild keeps it too but lands on /dashboard instead.
 *
 * REFS app/components/server-wait-overlay.tsx — sends them here once the new build answers
 *      lib/boot.ts › SESSION_EPOCH — the cutoff that decides whether a session survives
 */
export default async function UpdateCompletePage() {
  await requireUser();
  const version = getAppVersion();
  // "Update everything" leaves its add-on half queued for after the restart — if one is waiting,
  // this screen is the middle of the run, not the end. REFS ./continue-addons.tsx drains it
  const addonsPending = hasQueuedAddonUpdates();

  if (addonsPending) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center gap-5 text-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">JonDash is updated</h1>
          <p className="mx-auto mt-1.5 max-w-sm text-sm" style={{ color: "var(--muted)" }}>
            Now running <strong style={{ color: "var(--foreground)" }}>v{version}</strong>. Updating your
            add-ons next — this takes another minute.
          </p>
        </div>
        <ContinueAddons />
      </div>
    );
  }

  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-5 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: "color-mix(in srgb, var(--success) 16%, transparent)", color: "var(--success)" }}
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
