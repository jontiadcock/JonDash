"use client";

import { useSelectedLayoutSegments } from "next/navigation";

/**
 * Fades the page body in on first mount and replays the fade on every
 * client-side navigation. Keyed so the CSS animation restarts on each route
 * change; the surrounding layout chrome (sticky header / nav) stays mounted and
 * never flickers. The animation itself lives in globals.css (`.page-fade`) and
 * is disabled under prefers-reduced-motion.
 *
 * **Keyed on the page below this layout, not on the pathname.** They are the same
 * thing right up until a parallel route exists, and then they are not: opening a
 * module over the catalogue changes the URL without changing which page is
 * underneath, and a pathname key would tear the catalogue down and re-fade it
 * behind the panel that is expanding over it. Segments describe what this
 * wrapper actually contains — the `children` slot — so an overlay opening in a
 * sibling slot correctly leaves it alone. Route groups come back in the array
 * and are kept: this is an identity, not a breadcrumb.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const segments = useSelectedLayoutSegments();
  return (
    <div key={segments.join("/")} className="page-fade">
      {children}
    </div>
  );
}
