"use client";

import { useSelectedLayoutSegments } from "next/navigation";

/**
 * Fades the page body in and replays on each client navigation, while the layout chrome stays
 * mounted. The animation is `.page-fade` in globals.css, disabled under prefers-reduced-motion.
 *
 * ⚠ Keyed on the SEGMENTS below this layout, never the pathname. Opening a module over the
 * catalogue changes the URL without changing the page underneath, and a pathname key would tear
 * the catalogue down and re-fade it behind the panel expanding over it. Route groups are kept in
 * the key on purpose — it is an identity, not a breadcrumb.
 *
 * REFS app/(app)/layout.tsx · app/admin/layout.tsx — the two shells that wrap children in it
 *      app/components/confirm-dialog.tsx — `.page-fade` leaves a transform, which is why any
 *      modal must be portalled out (BUG-23)
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const segments = useSelectedLayoutSegments();
  return (
    <div key={segments.join("/")} className="page-fade">
      {children}
    </div>
  );
}
