"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";

/**
 * CORE-05 — asking for support, without ever nagging.
 *
 * Two pieces, deliberately unequal. **The line is always there and never moves**; the banner appears
 * once, after the install has been in use for a week, and never comes back once dismissed. A
 * self-hosted personal-use app that pesters its owner for money is worse than one that never asks.
 */

/** Where "buy me a coffee" goes. One place, so it is changed once. */
export const SUPPORT_URL = "https://github.com/jontiadcock";

const DISMISS_KEY = "jondash.supportBannerDismissed";
const DISMISS_EVENT = "jondash:support-dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    // Storage disabled: treat it as dismissed. Of the two ways to be wrong, showing a banner that
    // can never be dismissed is much the worse one.
    return true;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(DISMISS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(DISMISS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function dismiss(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* it just won't persist */
  }
  window.dispatchEvent(new CustomEvent(DISMISS_EVENT));
}

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
export function SupportBanner({ installedDays }: { installedDays: number }) {
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);
  if (dismissed || installedDays < 7) return null;

  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-3 text-sm"
      style={{
        background: "color-mix(in srgb, var(--primary) 8%, transparent)",
        color: "var(--foreground)",
      }}
    >
      <span style={{ color: "var(--primary)" }}>
        <Heart size={14} />
      </span>
      <span className="min-w-0 flex-1">
        You&apos;ve been running JonDash for{" "}
        {installedDays >= 365
          ? "over a year"
          : installedDays >= 30
            ? `${Math.floor(installedDays / 30)} month${installedDays >= 60 ? "s" : ""}`
            : `${installedDays} days`}
        . It&apos;s free and always will be — but if it&apos;s saved you some trouble, you could buy
        me a coffee.
      </span>
      <Link href="/help-meeeee" className="btn btn-ghost !py-1 !px-2 text-xs">
        Tell me more
      </Link>
      <button type="button" onClick={dismiss} className="btn btn-ghost !py-1 !px-2 text-xs">
        No thanks
      </button>
    </div>
  );
}
