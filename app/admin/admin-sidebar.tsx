"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };
type Group = { label: string | null; items: Item[] };

/**
 * The left "Settings" navigation for the admin area (desktop). Groups are already
 * filtered to what the user may access. The mobile view uses the AdminNav dropdown
 * instead (this sidebar is hidden below md).
 * REFS app/admin/layout.tsx
 */
export function AdminSidebar({ groups }: { groups: Group[] }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/admin"
      ? pathname === "/admin" || pathname.startsWith("/admin/users")
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="flex flex-col gap-5" aria-label="Settings">
      {groups.map((g, i) => (
        <div key={g.label ?? i} className="flex flex-col gap-1">
          {g.label && (
            // A section heading, not a link — smaller and bolder than the items,
            // wide-tracked, on a divider. Kept in step with the mobile drawer.
            <div
              className="border-t px-3 pt-3 pb-1 text-[10px] font-bold uppercase"
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
  );
}
