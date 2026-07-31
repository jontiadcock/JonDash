import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { PageTransition } from "@/app/components/page-transition";
import { UserMenu } from "@/app/components/user-menu";
import { BrandMark } from "@/app/components/branding";
import { SupportBanner, SupportLine } from "@/app/components/support";
import { installedDaysAgo } from "@/lib/install-age";
import { getUserFlag, USER_FLAG } from "@/lib/user-prefs";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  // Full admins and delegates (users holding at least one admin capability via an
  // access role) get a link into the admin area.
  const canAccessAdmin = (await getEffectivePermissions(user)).size > 0;
  const installedDays = await installedDaysAgo();
  // Per user, not per browser — dismissing on a phone must be remembered on a desktop (BUG-74).
  const bannerDismissed = await getUserFlag(user.id, USER_FLAG.supportBannerDismissed);

  return (
    /*
     * CORE-14 — a page opts out of the reading measure by marking itself `data-wide-page`, and
     * `:has()` widens the shell around it. `max-w-6xl` keeps prose and forms legible and is right
     * for almost every page, but squeezes a tile grid into the middle third of a wide display.
     * ⚠ The header must widen with the body, or the brand and account menu sit in a narrow column
     * above a full-width page and read as misalignment.
     * REFS app/(app)/dashboard/page.tsx — the only page that sets the attribute
     */
    <div className="group/shell min-h-screen flex flex-col has-[[data-wide-page]]:w-full">
      <header
        className="sticky top-0 z-10 border-b backdrop-blur"
        style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--background) 85%, transparent)" }}
      >
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-3 group-has-[[data-wide-page]]/shell:max-w-none sm:px-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2 font-semibold">
            <BrandMark />
          </Link>
          <div className="flex flex-none items-center gap-2 sm:gap-3">
            {canAccessAdmin && (
              <Link href="/admin" className="btn btn-ghost !py-1.5 !px-2.5 text-sm sm:!px-3">
                Admin
              </Link>
            )}
            <UserMenu email={user.email} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 group-has-[[data-wide-page]]/shell:max-w-none sm:py-8">
        <SupportBanner installedDays={installedDays} dismissed={bannerDismissed} />
        <PageTransition>{children}</PageTransition>
      </main>
      {/* Quiet, permanent, and outside the page transition so it doesn't re-fade on every
          navigation — furniture, not content. */}
      <footer className="mx-auto w-full max-w-6xl px-4 pb-6 text-center">
        <SupportLine />
      </footer>
    </div>
  );
}
