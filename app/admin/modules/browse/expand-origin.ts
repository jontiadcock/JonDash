/*
 * Where the overlay should appear to grow *from*. The card is in one route's tree and the panel in
 * another, and nothing in the routing layer carries a rect between them.
 *
 * ⚠ **Parked on `window`, not a module variable.** A module-scoped `let` assumes the two routes
 *   share one instance of this file — usually true, and not something to bet a feature on, since
 *   they are separate route entries. `window` has exactly one of everything by definition.
 * ⚠ **Reading it CONSUMES it.** A rect is only true for the click that produced it: a pasted link
 *   or Back/Forward has no origin, and a stale rect animates out of a card that has since moved.
 *
 * REFS app/admin/modules/browse/browse-grid.tsx — writes it on click
 *      app/admin/modules/browse/module-overlay.tsx — reads it once, and falls back when absent
 */
const KEY = "__jondashExpandOrigin";

type OriginHolder = { [KEY]?: DOMRect | null };

/** REFS browse-grid.tsx — called on the card click that opens the overlay. */
export function rememberOrigin(el: Element | null): void {
  if (typeof window === "undefined") return;
  (window as unknown as OriginHolder)[KEY] = el?.getBoundingClientRect() ?? null;
}

/** ⚠ Consumes. REFS module-overlay.tsx — claims it at commit, never during render. */
export function takeOrigin(): DOMRect | null {
  if (typeof window === "undefined") return null;
  const holder = window as unknown as OriginHolder;
  const rect = holder[KEY] ?? null;
  holder[KEY] = null;
  return rect;
}
