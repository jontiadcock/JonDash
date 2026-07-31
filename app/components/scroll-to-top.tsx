"use client";

import { useEffect, useState } from "react";

/**
 * A floating "back to top" button, shown only once the page is actually scrolled. The controls
 * that END a mode live at the top of the page, so any long page can strand you below them — which
 * is why it is mounted app-wide rather than bolted onto the dashboard grid.
 *
 * Bottom-right, above the safe-area inset so it clears a phone's home indicator.
 * REFS app/layout.tsx — the single mount point, for every page
 */
export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // ⚠ A viewport height, not a pixel count — "far enough to have lost sight of the top" is a
    // different number of pixels on a phone than on a desktop.
    const check = () => setVisible(window.scrollY > window.innerHeight * 0.6);
    check();
    // `passive`: this never calls preventDefault, and saying so keeps it off the critical path
    // of the scroll it is watching.
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => {
        // Honour reduced motion: for someone who gets motion sick, a full-page smooth scroll is
        // one of the worst offenders there is.
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
      }}
      aria-label="Back to top"
      title="Back to top"
      className="fixed z-40 flex h-11 w-11 items-center justify-center rounded-full transition lift"
      style={{
        right: "1rem",
        bottom: "calc(1rem + env(safe-area-inset-bottom))",
        background: "var(--surface)",
        color: "var(--foreground)",
        border: "1px solid var(--border-strong)",
        boxShadow: "var(--shadow-hover)",
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 19V5" strokeLinecap="round" />
        <path d="M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
