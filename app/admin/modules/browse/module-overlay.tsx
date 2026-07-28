"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { takeOrigin } from "./expand-origin";

/** Duration/easing read from the live theme, so a style — or reduced motion — decides the motion. */
function motion() {
  const css = getComputedStyle(document.documentElement);
  const ms = parseFloat(css.getPropertyValue("--motion-slow"));
  return {
    duration: Number.isFinite(ms) ? ms : 220,
    easing: css.getPropertyValue("--motion-ease").trim() || "ease-out",
  };
}

/**
 * The transform that lays the panel exactly over the card it came from — a FLIP: measure where the
 * thing ends up, then express where it started as an offset from that.
 *
 * With no card to point at (a pasted link, or Forward back into an overlay) it is a small scale
 * instead. Growing out of the middle of the screen is honest about not knowing; growing out of an
 * arbitrary card would not be.
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
 * The frame a module expands into, over the catalogue (design B1).
 *
 * Owner, 2026-07-28: *"my instructions were to have it expand over the other apps in an animation
 * and take the stage."* It first shipped as a plain navigation to another page, which reads as
 * leaving rather than opening.
 *
 * **The catalogue stays mounted behind it**, dimmed — that is what an intercepting route buys, and
 * it is why this is not simply a styled page. Closing returns you to exactly the grid you left, on
 * the page you were on, with no refetch.
 *
 * **The panel grows out of the card you clicked.** The card leaves its rectangle in
 * `expand-origin`, and the panel starts there and scales up to its real size — which is what makes
 * it read as one thing expanding rather than a dialog appearing on top of another.
 *
 * **Timings come from the theme's motion tokens, never from a literal.** Reduced motion zeroes
 * them, so honouring the token is what makes this animation skippable; a hard-coded `220ms` would
 * animate for someone who has asked the whole system not to.
 *
 * **Closing is `router.back()`, not a link.** The overlay exists because of a navigation, so
 * unwinding that navigation is the honest way to dismiss it: browser Back, Escape and the backdrop
 * then all do the same thing, and the URL is never left describing something that is no longer on
 * screen.
 */
export function ModuleOverlay({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const backdrop = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const leaving = useRef(false);
  // Consumed on mount, not on click: this is the one render where it is still true.
  const [from] = useState(takeOrigin);

  /**
   * Shrink back towards the card, then unwind the navigation.
   *
   * The navigation fires on whichever comes first, the animation finishing or a timer — because
   * **animation timelines stop in a hidden tab and `setTimeout` does not** (the lesson from the
   * dashboard's FLIP release, where cleanup in a `requestAnimationFrame` callback simply never
   * ran). Closing an overlay and immediately switching tabs must not leave the app parked on a URL
   * it is no longer showing.
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
    const end = fromCard(from, el);
    back.animate([{ opacity: 1 }, { opacity: 0 }], { duration: out, easing, fill: "forwards" });
    el.animate([{ transform: "none", opacity: 1 }, { transform: end, opacity: 0 }], {
      duration: out,
      easing,
      fill: "forwards",
    }).addEventListener("finish", go);
    setTimeout(go, out + 80);
  }, [from, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);

    /*
     * The page behind must not scroll while a modal is over it — otherwise dismissing returns you
     * somewhere other than where you opened from, and the card the panel shrinks back into has
     * moved.
     *
     * **Padded by exactly the scrollbar's width.** Hiding the overflow removes the scrollbar, and
     * the catalogue behind widens into the ~15px it occupied — every card shifts sideways at the
     * instant the panel starts growing out of one of them. The rectangle captured on the click was
     * measured against the page as it was, so this is not merely a flicker: it would aim the
     * animation at where the card used to be.
     */
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
    document.body.style.overflow = "hidden";

    // Move focus in, so a keyboard user is inside the thing that just opened rather than still on
    // the card behind it.
    panel.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPad;
    };
  }, [close]);

  /**
   * Play the expansion, then hand the panel back to the stylesheet.
   *
   * **Declared after the effect above, deliberately.** Effects run in the order they appear, and
   * that one takes the scrollbar away — which widens the viewport that this fixed panel is centred
   * in. Measuring first would aim the whole animation half a scrollbar off.
   *
   * `fill: "none"` on purpose: an animation that retains its last keyframe leaves a permanent
   * `transform` on the panel, and a transform makes it the containing block for every
   * `position: fixed` inside it. That is BUG-23 exactly, and it is why the page fade uses
   * `backwards` rather than `both`.
   */
  useEffect(() => {
    const el = panel.current;
    const back = backdrop.current;
    if (!el || !back) return;
    const { duration, easing } = motion();
    if (duration <= 0) return;

    back.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing });
    el.animate(
      [
        { transform: fromCard(from, el), opacity: 0 },
        // The content inside is stretched while the panel is any shape but its own, so it fades in
        // over the first half and the distortion is never legible.
        { opacity: 1, offset: 0.5 },
        { transform: "none", opacity: 1 },
      ],
      { duration, easing, fill: "none" },
    );
  }, [from]);

  /*
   * Portalled into `document.body` (BUG-23, and the same reason `ServerWaitOverlay` is).
   *
   * `position: fixed` is viewport-relative only while **no** ancestor has a transform. Every admin
   * page is wrapped in `.page-fade`, which animates a `translateY` on each navigation — and opening
   * this overlay IS a navigation. So for the length of that fade the wrapper would be the
   * containing block, and an un-portalled overlay would be sized against the content column and
   * then snap to the viewport when the fade ended. Rendered into the body it is nobody's child, so
   * it takes the stage — which is the whole ask.
   *
   * Guarded on `document` rather than a mounted flag: this only renders after a client-side
   * navigation, so there is no server render to miss, and `useEffect(() => setMounted(true))` is a
   * cascading render the React Compiler lint correctly refuses.
   */
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={backdrop}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{
        // Deliberately not `backdrop-filter`: a blur here promotes a full-viewport compositor
        // layer and re-reads the backdrop every frame, which is the cost measured in beta.1.
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
        // Stop a click inside the panel closing it — the backdrop is the dismiss target, and the
        // panel is a child of it.
        onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-3xl p-6 outline-none"
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
