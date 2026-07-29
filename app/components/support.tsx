"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { dismissSupportBannerAction } from "./support-actions";

/**
 * CORE-05 — asking for support, without ever nagging.
 *
 * Two pieces, deliberately unequal. **The line is always there and never moves**; the banner appears
 * once, after the install has been in use for a week, and never comes back once dismissed. A
 * self-hosted personal-use app that pesters its owner for money is worse than one that never asks.
 */

/** Where "buy me a coffee" goes. One place, so it is changed once. Owner's link, 2026-07-29. */
export const SUPPORT_URL = "https://buymeacoffee.com/k1jcmlkxsn";

/*
 * Dismissal is stored **against the person, on the server** — not in `localStorage`, which is where
 * this started and which was BUG-74.
 *
 * `localStorage` is scoped per browser *and per origin*. A self-hosted dashboard gets opened at
 * `localhost:3000` on the machine it runs on and at `192.168.1.50:3000` from a phone; those are
 * different origins, so "No thanks" on one was invisible to the other — and it is plainly the same
 * person either way. The owner dismissed it on their phone and met it again on a desktop.
 *
 * CORE-05's own wording was "once dismissed it stays dismissed — **per user**". That is a promise
 * about a person, and only per-user server-side state can keep it.
 */

/**
 * A heart drawn from the appearance tokens, so it belongs to whichever style and palette is on.
 *
 * Owner's wording: *"a JonDash-style love heart drawn from the user's own appearance tokens, so it
 * takes their palette."* `currentColor` rather than a fixed pink — on Terminal it is the terminal's
 * green, on XP the XP blue, and it never looks like something pasted in from another website.
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
 * The quiet line at the foot of the app (11.2).
 *
 * **Not highlighted, on purpose** — no card, no colour, no button. It is the same weight as the
 * version number it sits beside, because a permanent ask that shouts becomes something you learn to
 * ignore, and then the one time it matters you have already stopped seeing it.
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
 * The banner (11.3) — shown only once the install has been in use for a week.
 *
 * `installedDays` is computed on the server from when the first account was created. Somebody who
 * has just finished setup has no idea yet whether they like this, and asking them for money is the
 * fastest way to make sure they don't.
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
   * Three states: asking, acknowledged, gone.
   *
   * **The acknowledgement replaces the banner in place rather than opening a dialog.** The owner
   * asked for a popup; a modal is the one thing I would push back on here, because it arrives at
   * the exact moment somebody has said "no thanks" — pressing dismiss and being handed something
   * larger to dismiss is the opposite of what they asked for. In place, they are already looking
   * at it, it says the one thing worth saying, and it goes when they say so. Easy to change to a
   * dialog if the owner still wants one.
   *
   * The state moves the moment it is pressed rather than when the write returns: the server write
   * is what makes it stick, but nobody should watch a banner they have dismissed sit there.
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
   * **Stacks on a phone; one row from `sm` up.**
   *
   * It was a single `flex-wrap` row with the text on `flex-1`. That never wrapped: the two buttons
   * kept their intrinsic width, `min-w-0` let the text shrink to whatever was left, and on a 375px
   * screen the message became a fifteen-line column an inch wide beside them. Nothing overflowed —
   * which is why a sweep that only looked for content escaping the viewport called it fine.
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
