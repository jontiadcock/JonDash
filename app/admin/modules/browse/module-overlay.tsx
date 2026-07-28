"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { takeOrigin } from "./expand-origin";

/**
 * How long this movement gets, and how it eases.
 *
 * **The style decides, and a zero is an answer.** XP and Terminal set `--motion-slow: 0ms` on
 * purpose — a window was either up or it wasn't — so on those the panel appears instantly, and
 * that is correct rather than a bug. Crystal takes 380ms, Brutalist 110ms, and this follows each
 * of them. The only value treated as "no answer" is a token that is missing or unparseable, which
 * means something is wrong with the stylesheet rather than with the style.
 *
 * **Reduced motion is asked directly, rather than inferred from the token**, because those two
 * zeroes mean different things and only one of them is an accessibility request. Reading the
 * preference here keeps it true even if a style ever forgets to set a duration.
 */
/**
 * A CSS `<time>` in milliseconds — **units included**, which is the whole point.
 *
 * `parseFloat` on a duration token is the bug that made this animation invisible twice. The
 * stylesheet says `220ms`, but the built CSS says **`.22s`**: Tailwind's minifier rewrites a time
 * to whichever unit is shorter, and nothing in the source hints that it will. `parseFloat(".22s")`
 * is `0.22`, so every panel expanded over a fifth of a millisecond and looked like it simply
 * appeared. It survived review because the value *looked* like a number and the hand-written probe
 * that verified the animation had `380ms` typed into it, unminified — so the probe was the one
 * place the defect could not occur.
 *
 * `ms` is tested before `s` because "ms" also ends in "s".
 */
function cssMs(value: string): number | null {
  const raw = value.trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  if (/ms$/i.test(raw)) return n;
  if (/s$/i.test(raw)) return n * 1000;
  return n;
}

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
  /*
   * The card this panel came from, claimed once the tree is actually committed.
   *
   * **Not read during render.** It was, via `useState(takeOrigin)`, and that is wrong in a way
   * that only shows up under concurrent rendering: a navigation renders inside a transition, React
   * may render a tree it then throws away, and a discarded render had already consumed the
   * rectangle. The next render — the one that mounts — found nothing and fell back to growing from
   * the middle of the screen. Effects only run for trees that are kept.
   */
  const from = useRef<DOMRect | null>(null);

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
   * Everything that has to happen the moment the panel exists — locking the page, taking focus,
   * and playing the expansion — done in the **ref callback that attaches it**.
   *
   * **Not an effect, and that is the point.** Two betas put this in an effect and the owner saw no
   * animation either time: first `useEffect`, which runs after the browser has already painted the
   * finished panel, then `useLayoutEffect`, which should have been early enough and was not. The
   * identical code animates correctly in a plain page (`WORKING/flip-probe.html`, measured frame by
   * frame — `scale 0.416` on the first frame, `scale 1` at the style's duration), so what was
   * failing was never the animation: it was *when React chose to run it*. A ref callback has no
   * such scheduling. React hands the element over as it attaches it, during the commit, and the
   * work happens there — the closest thing React offers to the synchronous flow that demonstrably
   * works.
   *
   * **On the backdrop rather than the panel**, because refs attach children-first: by the time the
   * parent's callback runs, `panel.current` is set, whereas the panel's own callback would run
   * before the backdrop existed to fade.
   *
   * **Order inside matters.** The scroll lock comes before the measurement: hiding the overflow
   * removes the scrollbar, which widens both the viewport this fixed panel is centred in *and* the
   * catalogue behind it. Measuring first would aim the animation half a scrollbar wide of the card,
   * and the body is padded by the scrollbar's width so the cards behind don't slide sideways at the
   * exact moment the panel starts growing out of one of them.
   *
   * `fill: "none"` on purpose: an animation that retains its last keyframe leaves a permanent
   * `transform` on the panel, and a transform makes it the containing block for every
   * `position: fixed` inside it. That is BUG-23 exactly, and it is why the page fade uses
   * `backwards` rather than `both`.
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

    // Move focus in, so a keyboard user is inside the thing that just opened rather than still on
    // the card behind it.
    el.focus();

    // Claimed here rather than during render: a render can be discarded and re-run under a
    // transition, and the discarded one would have eaten the rectangle already.
    from.current = takeOrigin();

    // Zero is a real answer, not a missing one: XP and Terminal snap, and so does this.
    const { duration, easing } = motion();
    if (duration > 0) {
      back.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing });
      el.animate(
        [
          { transform: fromCard(from.current, el), opacity: 0 },
          // The content inside is stretched while the panel is any shape but its own, so it fades
          // in over the first half and the distortion is never legible.
          { opacity: 1, offset: 0.5 },
          { transform: "none", opacity: 1 },
        ],
        { duration, easing, fill: "none" },
      );
    }

    /*
     * One line, on purpose, and it stays for now.
     *
     * This has been wrong twice from a live install I cannot see, and both times the next step was
     * a guess. If it is wrong a third time this says which part failed — whether the panel grew
     * from a card or from nowhere, and what duration the active style asked for — instead of
     * costing another round trip to find out.
     */
    console.info(
      `[jondash] module panel: duration=${duration}ms origin=${from.current ? "card" : "none"}`,
    );

    // React 19 calls this cleanup when the element detaches, in place of a call with `null`.
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPad;
      backdrop.current = null;
    };
  }, []);

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
      ref={open}
      // `jd-overlay-in` / `jd-panel-in` are the CSS floor: they animate from the stylesheet at
      // first paint, so something always moves even if the script animation below never gets its
      // moment. The script one sorts above CSS animations and takes over when it does.
      className="jd-overlay-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
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
