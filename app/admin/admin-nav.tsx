"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const ITEMS = [
  { href: "/admin", label: "Users" },
  { href: "/admin/service-groups", label: "Service Groups" },
  { href: "/admin/sessions", label: "Sessions" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/backup", label: "Backup" },
  { href: "/admin/settings", label: "Settings" },
];

/** Single "Menu ▾" dropdown holding all admin sections. */
export function AdminNav() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
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
        className="btn btn-ghost !py-1.5 !px-3 text-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Menu <span aria-hidden>▾</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border py-1 shadow-lg"
          style={{ background: "var(--background)", borderColor: "var(--border)" }}
        >
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              className="block px-4 py-2 text-sm hover:bg-[var(--surface-2)]"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
