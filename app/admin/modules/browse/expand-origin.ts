/**
 * Where the overlay should appear to grow *from*.
 *
 * The owner's instruction for the catalogue was that a module should *"expand over the other apps
 * in an animation and take the stage"* — so the panel has to start life at the card that was
 * clicked, not in the middle of the screen. Nothing in the routing layer carries that: the card is
 * in one route's component tree and the panel is in another, and by the time the panel mounts the
 * click is long over.
 *
 * So the card leaves its rectangle here on the way out. A plain module variable is enough — both
 * sides are client components in one browser bundle, so they share this instance, and the value is
 * meaningless after the animation starts.
 *
 * **Reading it CONSUMES it.** A rect is only true for the click that produced it: opening a module
 * by pasted link, or by Back/Forward, has no origin at all, and a leftover rect from ten minutes
 * ago would animate the panel out of some card that has since scrolled elsewhere. Absent is the
 * honest answer in those cases, and the overlay has a fallback for it.
 */
let origin: DOMRect | null = null;

export function rememberOrigin(el: Element | null): void {
  origin = el?.getBoundingClientRect() ?? null;
}

export function takeOrigin(): DOMRect | null {
  const rect = origin;
  origin = null;
  return rect;
}
