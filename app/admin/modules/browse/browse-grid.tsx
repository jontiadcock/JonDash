"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import type { PermissionRisk } from "@/lib/modules/types";
import { rememberOrigin } from "./expand-origin";

/**
 * "You already have this one". A tick rather than a word because the catalogue is scanned, not
 * read.
 *
 * ⚠ Theme tokens, never literal colours — `--success` differs in each of the seven styles, and the
 *   tick is cut out in `--background` so it stays legible whether that green is dark or pale.
 * REFS app/globals.css — where the style tokens are defined
 */
function InstalledTick() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      className="flex-none"
      role="img"
      aria-label="Installed"
    >
      <title>Installed</title>
      <circle cx="10" cy="10" r="9" fill="var(--success)" />
      <path
        d="M5.8 10.4l2.7 2.7 5.7-5.9"
        fill="none"
        stroke="var(--background)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** One catalogue entry, flattened to plain data so the grid can be a client component. */
/** REFS app/admin/modules/browse/page.tsx — builds these from browseAvailableModules(). */
export type BrowseCard = {
  id: string;
  name: string;
  version: string;
  description: string;
  sourceName: string;
  installed: boolean;
  installedVersion: string | null;
  minAppVersion: string;
  /** This build is older than the module needs, so it cannot be installed (MOD-05 leftover). */
  tooOld: boolean;
  risk: { level: PermissionRisk; label: string; count: number };
};

const PER_PAGE_CHOICES = [10, 12, 24, 50] as const;
const PER_PAGE_KEY = "jondash.browsePerPage";
const DEFAULT_PER_PAGE = 12;

/*
 * The saved page size, as an external store. ⚠ `useSyncExternalStore`, not an effect — an effect
 * paints one render at the default before correcting, which is a visible reflow of the whole grid.
 * A number, so no snapshot caching is needed: primitives compare by value.
 */
const PER_PAGE_CHANGED = "jondash:browse-per-page";

function readPerPage(): number {
  try {
    const saved = Number(localStorage.getItem(PER_PAGE_KEY));
    if ((PER_PAGE_CHOICES as readonly number[]).includes(saved)) return saved;
  } catch {
    /* storage disabled */
  }
  return DEFAULT_PER_PAGE;
}

function writePerPage(n: number): void {
  try {
    localStorage.setItem(PER_PAGE_KEY, String(n));
  } catch {
    /* the choice just won't persist */
  }
  window.dispatchEvent(new CustomEvent(PER_PAGE_CHANGED));
}

function subscribePerPage(onChange: () => void): () => void {
  window.addEventListener(PER_PAGE_CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PER_PAGE_CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const RISK_STYLE: Record<PermissionRisk, { fg: string; bg: string }> = {
  none: { fg: "var(--muted)", bg: "var(--surface-2)" },
  standard: { fg: "var(--foreground)", bg: "var(--surface-2)" },
  // The only one that gets a colour. If everything is highlighted, nothing is.
  elevated: { fg: "var(--danger)", bg: "color-mix(in srgb, var(--danger) 12%, transparent)" },
};

/**
 * The module catalogue as a dense grid — three across, no imagery.
 *
 * ⚠ **A card is a summary and a way in, never a place to install from.** Clicking opens the
 * module's page, where permissions are written out in full, so **a module cannot be queued or
 * installed without its permissions having been on screen.** The old design put a checkbox on every
 * row.
 * No imagery on purpose: screenshots belong on the detail page, where there is room for them.
 * REFS browse/page.tsx — the caller · browse/[id]/page.tsx — where install lives ·
 *      lib/modules/types.ts › permissionRisk() — the chip
 * PINS tests/unit/browse-consent.test.ts
 */
export function BrowseGrid({
  items,
  channel,
  page,
}: {
  items: BrowseCard[];
  channel: string;
  page: number;
}) {
  /*
   * ⚠ Page NUMBER in the URL, page SIZE in the browser. Which page you are on must survive opening
   *   a module and coming back, which is what a URL is for; how many you like to see is a
   *   preference, and putting it in the URL means carrying it through every link to keep it.
   */
  const perPage = useSyncExternalStore(subscribePerPage, readPerPage, () => DEFAULT_PER_PAGE);

  const pages = Math.max(1, Math.ceil(items.length / perPage));
  // Clamped rather than trusted: a saved page size can shrink the catalogue under a page number
  // that came from a URL, and page 5 of 3 should show the last page, not nothing at all.
  const current = Math.min(Math.max(1, page), pages);
  const shown = items.slice((current - 1) * perPage, current * perPage);

  const href = (p: number) => `/admin/modules/browse?channel=${channel}&page=${p}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((m) => (
          <Link
            key={m.id}
            // Carry where you were, so the module's own page can send you back to it (8.4).
            href={`/admin/modules/browse/${encodeURIComponent(m.id)}?channel=${channel}&page=${current}`}
            // ⚠ The panel opens over this grid, so it must not move: Next's default scroll-to-top
            // would drag the card out from under the animation and lose your place.
            scroll={false}
            // Hand the panel the rect to grow from — it mounts in another route tree, long after
            // this click. REFS ./expand-origin.ts · ./module-overlay.tsx
            onClick={(e) => rememberOrigin(e.currentTarget)}
            className="card lift flex flex-col gap-2 p-4"
            style={m.tooOld ? { opacity: 0.55 } : undefined}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-medium">{m.name}</span>
              <span className="flex flex-none items-center gap-1.5">
                {m.installed && <InstalledTick />}
                <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
                  v{m.version}
                </span>
              </span>
            </div>

            <p className="line-clamp-3 text-sm" style={{ color: "var(--muted)" }}>
              {m.description}
            </p>

            <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
              <span
                className="rounded px-2 py-0.5 text-xs"
                style={{ color: RISK_STYLE[m.risk.level].fg, background: RISK_STYLE[m.risk.level].bg }}
              >
                {m.risk.label}
                {m.risk.count > 0 ? ` · ${m.risk.count}` : ""}
              </span>
              {/* The tick already says it is installed, so the only thing left worth printing is
                  a version that DISAGREES with the published one — which is how an available
                  update shows up here. Repeating "installed" under every ticked card is noise. */}
              {m.installed && m.installedVersion && m.installedVersion !== m.version && (
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  you have v{m.installedVersion}
                </span>
              )}
              {/* Greyed AND told why. Dimming alone reads as a rendering fault. */}
              {m.tooOld && (
                <span className="text-xs" style={{ color: "var(--warning)" }}>
                  needs JonDash {m.minAppVersion}+
                </span>
              )}
            </div>

            <span className="text-xs" style={{ color: "var(--muted)" }}>
              from {m.sourceName}
            </span>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span style={{ color: "var(--muted)" }}>Per page:</span>
          {PER_PAGE_CHOICES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => writePerPage(n)}
              className={perPage === n ? "btn btn-primary !py-1 !px-2 text-xs" : "btn btn-ghost !py-1 !px-2 text-xs"}
            >
              {n}
            </button>
          ))}
        </div>

        {pages > 1 && (
          <div className="flex items-center gap-2 text-sm">
            {current > 1 && (
              <Link href={href(current - 1)} className="btn btn-ghost !py-1 !px-2 text-xs">
                ← Previous
              </Link>
            )}
            <span style={{ color: "var(--muted)" }}>
              Page {current} of {pages}
            </span>
            {current < pages && (
              <Link href={href(current + 1)} className="btn btn-ghost !py-1 !px-2 text-xs">
                Next →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
