/**
 * Where the overlay should appear to grow *from*.
 *
 * The owner's instruction for the catalogue was that a module should *"expand over the other apps
 * in an animation and take the stage"* — so the panel has to start life at the card that was
 * clicked, not in the middle of the screen. Nothing in the routing layer carries that: the card is
 * in one route's component tree and the panel is in another, and by the time the panel mounts the
 * click is long over.
 *
 * **Parked on `window`, not in a module variable.** A module-scoped `let` is the obvious way to do
 * this and it assumes the two routes share one instance of this file. That is *usually* true and
 * it is not something to bet a feature on — the catalogue and the intercepted overlay are separate
 * route entries, and this project has already been bitten once by assuming two places got the same
 * module (server actions and page renders do not). `window` has exactly one of everything by
 * definition, which is the property actually needed here.
 *
 * **Reading it CONSUMES it.** A rect is only true for the click that produced it: opening a module
 * by pasted link, or by Back/Forward, has no origin at all, and a leftover rect from ten minutes
 * ago would animate the panel out of some card that has since scrolled elsewhere. Absent is the
 * honest answer in those cases, and the overlay has a fallback for it.
 */
const KEY = "__jondashExpandOrigin";

type OriginHolder = { [KEY]?: DOMRect | null };

export function rememberOrigin(el: Element | null): void {
  if (typeof window === "undefined") return;
  (window as unknown as OriginHolder)[KEY] = el?.getBoundingClientRect() ?? null;
}

export function takeOrigin(): DOMRect | null {
  if (typeof window === "undefined") return null;
  const holder = window as unknown as OriginHolder;
  const rect = holder[KEY] ?? null;
  holder[KEY] = null;
  return rect;
}
