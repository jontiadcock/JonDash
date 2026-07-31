"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { dismissSupportBannerAction } from "./support-actions";

/*
 * CORE-05 — asking for support without nagging. Two deliberately unequal pieces: the line is always
 * there and never moves; the banner appears once, after a week, and never returns once dismissed.
 *
 * REFS app/(app)/layout.tsx · app/admin/layout.tsx — both render `SupportBanner` + `SupportLine`
 */

/** Where "buy me a coffee" goes. One place, so it is changed once.
 *  REFS app/(app)/help-meeeee/page.tsx — the only other place the link is shown */
export const SUPPORT_URL = "https://buymeacoffee.com/k1jcmlkxsn";

/*
 * ⚠ Dismissal is per-PERSON server state, never `localStorage` (BUG-74). A self-hosted dashboard is
 * opened at `localhost` on its own machine and at a LAN address from a phone — different origins,
 * so "No thanks" on one was invisible on the other. CORE-05 promises "dismissed per user", which
 * only server-side state can keep.
 * REFS app/components/support-actions.ts › dismissSupportBannerAction() — the write
 */

/**
 * A heart drawn from the appearance tokens, so it belongs to whichever style and palette is on.
 * ⚠ `currentColor`, never a fixed pink — on Terminal it is the terminal's green, on XP the XP blue.
 * REFS app/(app)/help-meeeee/page.tsx · app/you-are-a-bloody-legend/page.tsx
 */
export function Heart({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      style={{ display: "inline-block", verticalAlign: "-0.1em" }}
    >
      <path d="M8 14.5s-5.7-3.6-5.7-7.3A3.2 3.2 0 0 1 8 5.1a3.2 3.2 0 0 1 5.7 2.1c0 3.7-5.7 7.3-5.7 7.3z" />
    </svg>
  );
}

/**
 * The quiet line at the foot of the app. ⚠ Deliberately unhighlighted — no card, no colour, no
 * button, the same weight as the version number beside it. A permanent ask that shouts is one
 * people learn to stop seeing.
 * REFS app/(app)/layout.tsx · app/admin/layout.tsx — the two footers
 */
export function SupportLine() {
  return (
    <Link
      href="/help-meeeee"
      className="inline-flex items-center gap-1.5 text-xs"
      style={{ color: "var(--muted)" }}
    >
      <Heart />
      <span>Help &amp; support</span>
    </Link>
  );
}

/**
 * The banner — shown only once the install has been in use for a week. Somebody who has just
 * finished setup has no idea yet whether they like this.
 * REFS app/(app)/layout.tsx · app/admin/layout.tsx — both compute `installedDays` from the first
 *      account's creation date and read this person's dismissal flag
 */
export function SupportBanner({
  installedDays,
  dismissed,
}: {
  installedDays: number;
  /** Read from this person's stored flag on the server, so a dismissed banner never flashes. */
  dismissed: boolean;
}) {
  /*
   * Three states: asking, acknowledged, gone. The acknowledgement replaces the banner IN PLACE
   * rather than opening a dialog — handing somebody a modal at the moment they said "no thanks"
   * gives them something larger to dismiss.
   *
   * The state moves on press, not when the write returns: the server write makes it stick, but
   * nobody should watch a banner they have dismissed sit there.
   */
  const [phase, setPhase] = useState<"asking" | "acknowledged" | "gone">("asking");
  const [, startDismiss] = useTransition();

  const dismiss = () => {
    setPhase("acknowledged");
    startDismiss(async () => {
      await dismissSupportBannerAction();
    });
  };

  if (dismissed || phase === "gone" || installedDays < 7) return null;

  const shell =
    "mb-4 flex flex-col gap-3 rounded-xl px-4 py-3 text-sm sm:flex-row sm:items-center";
  const shellStyle = {
    background: "color-mix(in srgb, var(--primary) 8%, transparent)",
    color: "var(--foreground)",
  };

  if (phase === "acknowledged") {
    return (
      <div className={shell} style={shellStyle}>
        <span className="flex min-w-0 flex-1 items-start gap-2">
          <span className="mt-0.5 flex-none" style={{ color: "var(--primary)" }}>
            <Heart size={14} />
          </span>
          <span>
            That&apos;s the last you&apos;ll hear of it — this won&apos;t come back. If you ever
            change your mind, there&apos;s a link on the{" "}
            <Link href="/help-meeeee" style={{ color: "var(--primary)" }}>
              Help &amp; support
            </Link>{" "}
            page. Thanks for using JonDash.
          </span>
        </span>
        <span className="flex flex-none gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => setPhase("gone")}
            className="btn btn-ghost !py-1 !px-2 text-xs"
          >
            Got it
          </button>
        </span>
      </div>
    );
  }

  /*
   * ⚠ Stacks on a phone, one row from `sm` up. A single `flex-wrap` row never wraps here: the
   * buttons keep their intrinsic width and `min-w-0` lets the text shrink to whatever is left, so
   * on a 375px screen the message became a fifteen-line column an inch wide. Nothing overflowed,
   * so a check that only looks for content escaping the viewport passes it.
   */
  return (
    <div className={shell} style={shellStyle}>
      <span className="flex min-w-0 flex-1 items-start gap-2">
        <span className="mt-0.5 flex-none" style={{ color: "var(--primary)" }}>
          <Heart size={14} />
        </span>
        <span>
          You&apos;ve been running JonDash for{" "}
          {installedDays >= 365
            ? "over a year"
            : installedDays >= 60
              ? `${Math.floor(installedDays / 30)} months`
              : installedDays >= 30
                ? "a month"
                : `${installedDays} days`}
          . It&apos;s free and always will be — but if it&apos;s saved you some trouble, you could
          buy me a coffee.
        </span>
      </span>
      {/* Their own row on a phone, so neither button can steal width from the sentence. */}
      <span className="flex flex-none gap-2 self-end sm:self-auto">
        <Link href="/help-meeeee" className="btn btn-ghost !py-1 !px-2 text-xs">
          Tell me more
        </Link>
        {/* Says what it does: this is the permanent one, not "hide for now". */}
        <button type="button" onClick={dismiss} className="btn btn-ghost !py-1 !px-2 text-xs">
          Don&apos;t ask again
        </button>
      </span>
    </div>
  );
}
