"use client";

import { usePathname } from "next/navigation";

/**
 * Fades the page body in on first mount and replays the fade on every
 * client-side navigation. Keyed by pathname so the CSS animation restarts on
 * each route change; the surrounding layout chrome (sticky header / nav) stays
 * mounted and never flickers. The animation itself lives in globals.css
 * (`.page-fade`) and is disabled under prefers-reduced-motion.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-fade">
      {children}
    </div>
  );
}
