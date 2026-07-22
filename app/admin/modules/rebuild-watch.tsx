"use client";

import { useCallback, useEffect, useState } from "react";
import { ServerWaitOverlay } from "@/app/components/server-wait-overlay";

/**
 * Shows the full-screen "applying your module changes" cover while JonDash rebuilds and
 * restarts, then returns the user to sign-in on its own.
 *
 * Installing, importing or uninstalling a module ends with the server process exiting so
 * the launcher can rebuild it. The triggering request therefore never completes, which
 * previously left the button stuck on "Installing…" forever with no indication that
 * anything was happening or that the page would need reloading.
 *
 * The current process's `boot` value is captured on mount — before anything is triggered
 * — so the overlay can tell the *new* server from the old one still winding down.
 */
export function useRebuildWatch() {
  const [oldBoot, setOldBoot] = useState<number | null>(null);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/health", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { boot?: number } | null) => {
        // Null is survivable: the overlay falls back to "answered again after going down".
        if (alive && typeof d?.boot === "number") setOldBoot(d.boot);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const start = useCallback(() => setWaiting(true), []);
  const stop = useCallback(() => setWaiting(false), []);

  const overlay = waiting ? <ServerWaitOverlay mode="modules" oldBoot={oldBoot} /> : null;

  return { overlay, waiting, start, stop };
}
