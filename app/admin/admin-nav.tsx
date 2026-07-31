"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Item = { href: string; label: string };
type Group = { label: string | null; items: Item[] };

/**
 * How long the panel stays mounted after closing, so the slide-out is visible. ⚠ Only the unmount
 * fallback — the visual duration is `--motion-slow`, which each style sets, so this must be at
 * least the slowest style's value. Overshooting is harmless: the panel is `pointer-events: none`
 * once it starts leaving. REFS app/styles.css — where each style sets that variable
 */
const SLIDE_MS = 420;

/**
 * Mobile admin navigation — a hamburger sliding a panel out from the left, shown only below `md`;
 * desktop uses the always-visible sidebar instead.
 *
 * ⚠ Portalled to `document.body` so it covers the viewport rather than the header it sits in: an
 * ancestor transform such as `.page-fade` otherwise makes `fixed` relative to the content column
 * (BUG-23). REFS app/admin/admin-sidebar.tsx — the desktop half; both read the same `groups`
 *      app/admin/layout.tsx — builds them · app/components/server-wait-overlay.tsx — same portal
 */
export function AdminNav({ groups }: { groups: Group[] }) {
  const pathname = usePathname();
  const [render, setRender] = useState(false); // mounted (kept during the slide-out)
  const [visible, setVisible] = useState(false); // transitioned-in
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const open = useCallback(() => {
    clearTimeout(closeTimer.current);
    setRender(true);
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    closeTimer.current = setTimeout(() => setRender(false), SLIDE_MS);
  }, []);

  // Slide in on the frame after mount so the transform actually animates.
  useEffect(() => {
    if (!render) return;
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [render]);

  // While the drawer exists: close on Escape and lock body scroll behind it.
  useEffect(() => {
    if (!render) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [render, close]);

  const isActive = (href: string) =>
    href === "/admin"
      ? pathname === "/admin" || pathname.startsWith("/admin/users")
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost !px-2 !py-1.5"
        aria-label="Open settings menu"
        aria-expanded={render}
        onClick={open}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {render && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[9998] md:hidden" role="dialog" aria-modal="true" aria-label="Settings menu">
              {/* Backdrop. `pointerEvents` follows `visible`, not `render`: the panel stays
                  mounted for SLIDE_MS after closing so it can slide out, and an opacity-0
                  backdrop still swallows clicks — which a style with instant motion (XP) would
                  turn into a fifth of a second of a dead, invisible screen. */}
              <div
                className="absolute inset-0 transition-opacity"
                style={{
                  background: "rgba(0,0,0,0.45)",
                  opacity: visible ? 1 : 0,
                  pointerEvents: visible ? "auto" : "none",
                  transitionDuration: "var(--motion-slow)",
                }}
                onClick={close}
                aria-hidden
              />
              {/* Panel */}
              <div
                className="absolute inset-y-0 left-0 flex w-72 max-w-[82%] flex-col overflow-y-auto border-r shadow-xl transition-transform"
                style={{
                  background: "var(--background)",
                  borderColor: "var(--border)",
                  transform: visible ? "translateX(0)" : "translateX(-100%)",
                  // The style owns the timing (CORE-07). SLIDE_MS below is only the unmount
                  // fallback, so it must be >= the slowest style's --motion-slow.
                  transitionDuration: "var(--motion-slow)",
                  pointerEvents: visible ? "auto" : "none",
                }}
              >
                <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
                  <span className="text-sm font-semibold">Settings</span>
                  <button
                    type="button"
                    className="btn btn-ghost !px-2 !py-1.5"
                    aria-label="Close settings menu"
                    onClick={close}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>

                <nav className="flex flex-col gap-5 px-3 py-4" aria-label="Settings">
                  {groups.map((g, i) => (
                    <div key={g.label ?? i} className="flex flex-col gap-1">
                      {g.label && (
                        // A section heading, not an option — smaller and bolder than the links,
                        // on a divider so it cannot be mistaken for something tappable.
                        <div
                          className="mt-1 border-t px-3 pt-3 pb-1 text-[10px] font-bold uppercase"
                          style={{ color: "var(--muted)", borderColor: "var(--border)", letterSpacing: "0.12em", opacity: 0.85 }}
                        >
                          {g.label}
                        </div>
                      )}
                      {g.items.map((it) => {
                        const active = isActive(it.href);
                        return (
                          <Link
                            key={it.href}
                            href={it.href}
                            aria-current={active ? "page" : undefined}
                            onClick={close}
                            className={`rounded-lg px-3 py-2 text-sm transition hover:bg-[var(--surface-2)] ${active ? "font-semibold" : ""}`}
                            style={active ? { background: "var(--surface-2)", color: "var(--foreground)" } : { color: "var(--muted)" }}
                          >
                            {it.label}
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                </nav>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
