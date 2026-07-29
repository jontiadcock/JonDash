import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { getAppVersion } from "@/lib/update";
import { Heart, SUPPORT_URL } from "@/app/components/support";

export const dynamic = "force-dynamic";

/**
 * Help &amp; support — CORE-05, and 11.1 of the 1.8.0 rework.
 *
 * **The address is `/help-meeeee`, with five `e`s, and it is not a typo.** The owner wrote it twice,
 * the second time emphasising the spelling. Recorded as a locked decision in `docs/ROADMAP.md`
 * because it is exactly the kind of thing a later tidy-up would "fix".
 *
 * **Tone lives here and nowhere else.** JonDash is otherwise dry and infrastructural — it guards
 * somebody's services — so the personality belongs on this page and on the thank-you page, not
 * sprinkled through the admin UI where someone is trying to fix something.
 *
 * Signed-in only, and **inside the `(app)` group so it gets the shell** — header, the way back, and
 * the support line at the foot. It was briefly a top-level route, which rendered a bare column with
 * no navigation on it at all: a help page you cannot leave is a special kind of unhelpful.
 */
export default async function HelpPage() {
  await requireUser();
  const version = getAppVersion();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <section>
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Help, meeeee</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Something not working, or just wondering how a thing is meant to work? Start here.
        </p>
      </section>

      <section className="card flex flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold">Getting help</h2>
        <div className="flex flex-col gap-3 text-sm">
          {/*
            `{" "}` after each `</strong>`, rather than a plain space in the source.

            The space is NOT reliable: an identical-looking line lost it while its neighbour kept
            it, and this was visible on the page as "Something is confusing.Most screens". Confirmed
            at the compile step, not in the browser — the built chunk contained `"…broken."}," The`
            and `"…confusing."},"Most`. Whitespace next to an inline tag is inferred from how the
            source happens to be wrapped, so any re-flow of this paragraph can silently delete a
            space. Written explicitly, it cannot.
          */}
          <p>
            <strong>Something is broken.</strong>{" "}
            The launcher keeps a log of every start, crash and update under{" "}
            <code className="font-mono text-xs">logs\</code> in your JonDash folder — that is the
            first thing worth reading, and the first thing worth attaching if you report it.
          </p>
          <p>
            <strong>Something is confusing.</strong>{" "}
            Most screens explain themselves underneath the control rather than in a manual. If one
            doesn&apos;t, that is a fault in the screen and worth telling me about.
          </p>
          <p>
            <strong>An add-on is misbehaving.</strong>{" "}
            Add-ons are separate from JonDash itself — check{" "}
            <Link href="/admin/modules" style={{ color: "var(--primary)" }}>
              Addons
            </Link>
            , where each one names its version and what it is allowed to do.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="https://github.com/jontiadcock/JonDash/issues"
            target="_blank"
            rel="noreferrer noopener"
            className="btn btn-primary text-sm"
          >
            Report a problem
          </a>
          <a
            href="https://github.com/jontiadcock/JonDash"
            target="_blank"
            rel="noreferrer noopener"
            className="btn btn-ghost text-sm"
          >
            Documentation
          </a>
        </div>
      </section>

      <section className="card flex flex-col gap-4 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <span style={{ color: "var(--primary)" }}>
            <Heart size={16} />
          </span>
          Buy me a coffee
        </h2>
        <div className="flex flex-col gap-3 text-sm">
          <p>
            JonDash is free, and stays free. There is no paid tier, nothing is held back, and this
            page will never turn into a paywall — that is a promise about the software, not a
            marketing line.
          </p>
          <p>
            It is also one person&apos;s evenings. If it has saved you an afternoon of wrestling with
            a reverse proxy, or you just like having your things in one place, a coffee would be
            very welcome — and I should be clear that coffee is not a gift in this house, it is a
            <strong> runtime dependency</strong>. JonDash builds fine without one. I do not.
          </p>
          <p style={{ color: "var(--muted)" }}>
            And if not — genuinely, that is fine. Nothing about JonDash changes either way, and I
            would rather you kept using it.
          </p>
        </div>
        <div>
          <a
            href={SUPPORT_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="btn btn-primary text-sm"
          >
            Buy me a coffee
          </a>
        </div>
      </section>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        JonDash {version} · thank you for running it.
      </p>
    </div>
  );
}
