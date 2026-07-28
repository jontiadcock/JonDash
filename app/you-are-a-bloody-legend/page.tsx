import Link from "next/link";
import { Heart } from "@/app/components/support";

export const dynamic = "force-dynamic";

/**
 * The thank-you page (CORE-05).
 *
 * **It cannot verify that anyone paid, and does not pretend to.** A payment provider confirms a
 * payment by webhook, which a self-hosted instance behind somebody's home router generally cannot
 * receive — so this is simply the return address a provider sends people back to. It stores nothing,
 * grants nothing, and is reachable by anyone who types it. Anything else would be theatre, and
 * theatre about money is the kind that gets noticed.
 *
 * Not behind `requireUser` for the same reason: a payment provider's redirect lands in whatever
 * browser the person paid in, which may not be the one they are signed into.
 */
export default function ThankYouPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center gap-6 p-6 text-center">
      <span style={{ color: "var(--primary)" }}>
        <Heart size={48} />
      </span>
      <h1 className="text-3xl font-semibold tracking-tight">You are a bloody legend</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        That is the whole page. There is no supporter tier, no badge, and nothing has been unlocked —
        JonDash was already all of itself. You just made someone&apos;s week.
      </p>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Now go and put something useful on your dashboard.
      </p>
      <Link href="/dashboard" className="btn btn-primary text-sm">
        Back to the dashboard
      </Link>
    </div>
  );
}
