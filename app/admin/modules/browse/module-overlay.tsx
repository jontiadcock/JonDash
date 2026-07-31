"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { takeOrigin } from "./expand-origin";

/**
 * A CSS `<time>` in milliseconds, **units included**.
 *
 * ⚠ **Never `parseFloat` a duration token.** The stylesheet says `220ms`; the built CSS says
 *   `.22s`, because Tailwind's minifier rewrites a time to whichever unit is shorter. That read as
 *   0.22ms and made this animation invisible twice. `ms` is tested before `s` because "ms" also
 *   ends in "s".
 * REFS app/globals.css · app/styles.css — where `--motion-slow` is set per style
 */
function cssMs(value: string): number | null {
  const raw = value.trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  if (/ms$/i.test(raw)) return n;
  if (/s$/i.test(raw)) return n * 1000;
  return n;
}

/**
 * ⚠ **A zero duration is an answer, not a missing value.** XP and Terminal set `--motion-slow: 0ms`
 *   deliberately, so the panel snapping there is correct. Only a missing or unparseable token falls
 *   back to 260. Reduced motion is asked directly rather than inferred from a zero, because the two
 *   zeroes mean different things and only one is an accessibility request.
 * REFS app/admin/admin-nav.tsx — reads the same tokens for the nav transition
 */
function motion() {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return { duration: 0, easing: "linear" };
  }
  const css = getComputedStyle(document.documentElement);
  const token = cssMs(css.getPropertyValue("--motion-slow"));
  return {
    duration: token ?? 260,
    easing: css.getPropertyValue("--motion-ease").trim() || "ease-out",
  };
}

/**
 * A FLIP: measure where the panel ends up, then express where it started as an offset from that.
 * With no card to point at — a pasted link, or Forward into an overlay — it is a small scale
 * instead, which is honest about not knowing rather than pointing at an arbitrary card.
 */
function fromCard(from: DOMRect | null, panel: HTMLElement): string {
  const to = panel.getBoundingClientRect();
  if (!from || from.width <= 0 || from.height <= 0 || to.width <= 0 || to.height <= 0) {
    return "scale(0.96)";
  }
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${from.width / to.width}, ${from.height / to.height})`;
}

/**
 * The frame a module expands into, over the catalogue (design B1). **The catalogue stays mounted
 * behind it, dimmed**, so closing returns you to the grid you left with no refetch.
 *
 * ⚠ **Closing is `router.back()`, not a link** — the overlay exists because of a navigation, so
 *   Back, Escape and the backdrop all unwind the same one and the URL never lies.
 *
 * REFS app/admin/modules/browse/@modal/(.)[id]/page.tsx — the intercepting route that renders this
 *      app/admin/modules/browse/expand-origin.ts › takeOrigin() — the card rectangle it grows from
 *      app/globals.css — `jd-overlay-in`, `jd-panel-in`, and the motion tokens
 */
export function ModuleOverlay({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const backdrop = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const leaving = useRef(false);
  /*
   * ⚠ **Never read during render.** `useState(takeOrigin)` consumed the rectangle in a render React
   *   then discarded under a transition, so the render that actually mounted found nothing. Claimed
   *   at commit instead — effects only run for trees that are kept.
   */
  const from = useRef<DOMRect | null>(null);

  /**
   * Shrink back towards the card, then unwind the navigation.
   *
   * ⚠ Fires on the animation finishing **or** a timer, whichever is first: **animation timelines
   *   stop in a hidden tab and `setTimeout` does not.** Closing then switching tabs must not park
   *   the app on a URL it is no longer showing.
   */
  const close = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;

    const el = panel.current;
    const back = backdrop.current;
    const { duration, easing } = motion();
    if (!el || !back || duration <= 0) {
      router.back();
      return;
    }

    let gone = false;
    const go = () => {
      if (gone) return;
      gone = true;
      router.back();
    };

    // Half the entrance: leaving should feel quicker than arriving.
    const out = Math.round(duration / 2);
    const end = fromCard(from.current, el);
    back.animate([{ opacity: 1 }, { opacity: 0 }], { duration: out, easing, fill: "forwards" });
    el.animate([{ transform: "none", opacity: 1 }, { transform: end, opacity: 0 }], {
      duration: out,
      easing,
      fill: "forwards",
    }).addEventListener("finish", go);
    setTimeout(go, out + 80);
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  /**
   * Lock the page, take focus, play the expansion — in the **ref callback that attaches it**.
   *
   * ⚠ **Not an effect.** Two betas shipped with no animation: `useEffect` runs after the finished
   *   panel is painted, and `useLayoutEffect` was still not early enough. A ref callback has no
   *   scheduling — React hands the element over during the commit.
   * ⚠ **On the backdrop, not the panel**: refs attach children-first, so `panel.current` is already
   *   set here, whereas the panel's own callback would run before the backdrop existed to fade.
   * ⚠ **Scroll lock before measurement.** Hiding the overflow removes the scrollbar and widens the
   *   viewport this fixed panel centres in; measuring first aims half a scrollbar wide of the card.
   */
  const open = useCallback((back: HTMLDivElement | null) => {
    backdrop.current = back;
    const el = panel.current;
    if (!back || !el) return;

    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
    document.body.style.overflow = "hidden";

    // Focus in, so a keyboard user is inside what just opened rather than on the card behind it.
    el.focus();

    // See the ref note above — claimed at commit, never during render.
    from.current = takeOrigin();

    const { duration, easing } = motion();
    if (duration > 0) {
      back.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing });
      el.animate(
        [
          { transform: fromCard(from.current, el), opacity: 0 },
          // Content is stretched while the panel is any shape but its own, so it fades in over the
          // first half and the distortion is never legible.
          { opacity: 1, offset: 0.5 },
          { transform: "none", opacity: 1 },
        ],
        // ⚠ `fill: "none"` — a retained keyframe leaves a permanent transform, which makes this the
        // containing block for every `position: fixed` inside it. That is BUG-23.
        { duration, easing, fill: "none" },
      );
    }

    // ⚠ React 19 calls this cleanup when the element detaches, in place of a call with `null`.
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPad;
      backdrop.current = null;
    };
  }, []);

  /*
   * ⚠ **Must be portalled to `document.body`** (BUG-23). `position: fixed` is viewport-relative
   *   only while no ancestor has a transform, and `.page-fade` animates a `translateY` on every
   *   navigation — including the one that opens this. Un-portalled it would size against the
   *   content column, then snap to the viewport when the fade ended.
   *
   * Guarded on `document` rather than a mounted flag: this only renders after a client-side
   * navigation, and `useEffect(() => setMounted(true))` is a cascading render the lint refuses.
   * REFS app/(app)/update-complete/continue-addons.tsx — `ServerWaitOverlay`, portalled for the
   *      same reason · app/components/confirm-dialog.tsx · app/admin/admin-nav.tsx — `.page-fade`
   */
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={open}
      // The CSS floor: these animate from the stylesheet at first paint, so something always moves
      // even if the script animation never gets its moment. REFS app/globals.css
      className="jd-overlay-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{
        // ⚠ Deliberately not `backdrop-filter` — a blur promotes a full-viewport compositor layer
        // and re-reads the backdrop every frame.
        background: "color-mix(in srgb, var(--background) 78%, transparent)",
      }}
      onClick={close}
      role="presentation"
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        // The backdrop is the dismiss target and the panel is its child, so stop the bubble.
        onClick={(e) => e.stopPropagation()}
        className="jd-panel-in card w-full max-w-3xl p-6 outline-none"
      >
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={close}
            className="btn btn-ghost !py-1 !px-2 text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
