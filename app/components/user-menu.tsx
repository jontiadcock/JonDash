"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/app/(app)/actions";

/**
 * The account control at the right of every header: a small person icon (not a row of word
 * buttons), so a phone header is just the logo plus one compact control. Clicking it opens a
 * menu with "My account" and a "Sign out" that asks to confirm first — a stray tap can't sign
 * you out. Replaces the separate Account / email / Sign out buttons.
 */
export function UserMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setConfirming(false);
  };

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="btn btn-ghost flex items-center gap-1 !px-2 !py-1.5"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <svg viewBox="0 0 20 20" className="h-5 w-5 flex-none" fill="currentColor" aria-hidden>
          <path d="M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 1.5c-2.67 0-6 1.34-6 3.75V16h12v-.75c0-2.41-3.33-3.75-6-3.75Z" />
        </svg>
        <span aria-hidden className="text-xs">▾</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-xl border py-1 shadow-lg"
          style={{ background: "var(--background)", borderColor: "var(--border)" }}
        >
          <div className="border-b px-4 py-2 text-xs" style={{ color: "var(--muted)", borderColor: "var(--border)" }}>
            Signed in as
            <div className="truncate text-[13px]" style={{ color: "var(--foreground)" }}>
              {email}
            </div>
          </div>

          <Link
            href="/account"
            role="menuitem"
            className="block px-4 py-2 text-sm hover:bg-[var(--surface-2)]"
            onClick={close}
          >
            My account
          </Link>

          {!confirming ? (
            <button
              type="button"
              role="menuitem"
              className="block w-full px-4 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
              onClick={() => setConfirming(true)}
            >
              Sign out
            </button>
          ) : (
            <div className="px-3 pb-2 pt-1.5">
              <p className="mb-2 px-1 text-xs" style={{ color: "var(--muted)" }}>
                Sign out of JonDash?
              </p>
              <div className="flex gap-2">
                <form action={logoutAction} className="flex-1">
                  <button
                    type="submit"
                    className="w-full rounded-lg px-3 py-1.5 text-sm font-medium text-white"
                    style={{ background: "var(--danger)" }}
                  >
                    Sign out
                  </button>
                </form>
                <button
                  type="button"
                  className="btn btn-ghost !py-1.5 text-sm"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
