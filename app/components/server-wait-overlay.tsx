"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** REFS app/admin/server/server-power-panel.tsx · app/admin/modules/rebuild-watch.tsx */
export type ServerWaitMode = "updating" | "restarting" | "shutdown" | "modules";

const COPY: Record<ServerWaitMode, { title: string; body: string }> = {
  updating: {
    title: "Updating JonDash…",
    body: "The dashboard is installing the update and restarting. This can take a minute or two.",
  },
  restarting: {
    title: "Restarting JonDash…",
    body: "The dashboard is restarting. This usually takes only a few seconds.",
  },
  shutdown: {
    title: "JonDash has been shut down",
    body: "To use the dashboard again, start it on the server PC (run start-dashboard).",
  },
  modules: {
    title: "Applying your module changes…",
    body:
      "A module's code is built into the dashboard, so JonDash is rebuilding and restarting. " +
      "This can take a minute or two.",
  },
};

// Two consecutive healthy responses, so a port that briefly opens then fails does not count.
// The wait is then only the real downtime rather than a fixed pause on top of it.
const REQUIRED_OKS = 2;
const POLL_MS = 800;
const SETTLE_MS = 400;
// If the server never goes down, nothing will bring us back — say so rather than spinning
// forever, which is indistinguishable from the app being broken.
const STALL_AFTER_MS = 90_000;

/**
 * Full-screen "please wait" cover for an update, restart, rebuild or shutdown. It polls
 * `/api/health` and returns the user to the app once the NEW server answers reliably.
 *
 * ⚠ A pure client overlay with no server dependency of its own — that is what lets it keep
 * rendering while the server is offline, which is the whole job. Keep it that way.
 *
 * REFS app/api/health/route.ts › boot — the value that identifies a new process
 *      app/admin/server/server-power-panel.tsx · app/admin/modules/rebuild-watch.tsx ·
 *      app/admin/modules/browse/module-overlay.tsx · app/(app)/update-complete/continue-addons.tsx
 */
export function ServerWaitOverlay({
  mode,
  oldBoot,
}: {
  mode: ServerWaitMode;
  oldBoot: number | null;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const startedAt = Date.now();
    const ticker = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);

    // Shutdown isn't coming back — just show the message.
    if (mode === "shutdown") {
      return () => clearInterval(ticker);
    }

    let cancelled = false;
    let oks = 0;
    let sawDown = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const done = () => {
      if (cancelled) return;
      cancelled = true;
      // Still signed in: a graceful restart keeps sessions. Shutdown never reaches here.
      // REFS lib/boot.ts · lib/server-control.ts — what makes the session survive
      window.location.href = mode === "updating" ? "/update-complete" : "/dashboard";
    };

    async function poll() {
      if (cancelled) return;
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const data = res.ok ? ((await res.json()) as { boot?: number }) : null;
        const boot = typeof data?.boot === "number" ? data.boot : null;
        // "New process" = a `boot` different from the one before we restarted. Without an old
        // boot, fall back to "answered again after we saw it go down".
        const isNewProcess = oldBoot != null ? boot != null && boot !== oldBoot : sawDown;
        if (isNewProcess) {
          oks += 1;
          if (oks >= REQUIRED_OKS) {
            setReconnecting(true);
            timer = setTimeout(done, SETTLE_MS);
            return;
          }
        } else {
          oks = 0; // still the old process, or not confirmably new yet
          // Answering as the SAME process long after we asked it to restart means the restart
          // never began. Don't spin silently.
          if (!sawDown && Date.now() - startedAt > STALL_AFTER_MS) setStalled(true);
        }
      } catch {
        sawDown = true; // connection failed — the server is down (restarting)
        oks = 0;
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    }

    poll();
    return () => {
      cancelled = true;
      clearInterval(ticker);
      if (timer) clearTimeout(timer);
    };
  }, [mode, oldBoot]);

  const copy = COPY[mode];
  const isShutdown = mode === "shutdown";

  /*
   * ⚠ Must be portalled into `document.body` (BUG-23). `fixed` is only viewport-relative while NO
   * ancestor has a transform, and every admin page is wrapped in `.page-fade`, whose keyframes
   * retain their final transform — so this covered the content column instead of the page.
   * ⚠ Guarded on `document`, not a mounted-state flag: this only renders after a client action, so
   * the server render is null anyway, and `useEffect(() => setState(true))` is a cascading render
   * the React Compiler lint refuses.
   */
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-6"
      style={{ background: "var(--background)" }}
      role="alertdialog"
      aria-live="assertive"
      aria-busy={!isShutdown}
    >
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        {isShutdown ? (
          <div
            className="flex h-14 w-14 items-center justify-center"
            style={{
              background: "var(--surface-2)",
              color: "var(--muted)",
              // Follows the style rather than being a hardcoded circle — a perfect circle
              // looks out of place in XP and Brutalist, where nothing else is round.
              borderRadius: "var(--radius-card)",
            }}
            aria-hidden="true"
          >
            <span className="block h-4 w-4" style={{ background: "var(--muted)" }} />
          </div>
        ) : (
          // The shared busy primitive (CORE-07): each style decides what "working" looks
          // like — a ring, XP's marching blocks, Terminal's blinking cursor.
          <div className="spinner" aria-hidden="true" />
        )}

        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {reconnecting
              ? mode === "updating"
                ? "Update applied — reconnecting…"
                : "Reconnecting — you’re still signed in…"
              : copy.body}
          </p>
        </div>

        {!isShutdown && !stalled && (
          <>
            <p
              className="rounded-lg px-3 py-2 text-xs"
              style={{ background: "var(--surface-2)", color: "var(--muted)" }}
            >
              Please don&apos;t refresh or close this tab — it will reconnect on its own.
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {elapsed}s elapsed
            </p>
          </>
        )}

        {stalled && (
          <div className="flex flex-col items-center gap-3">
            <p
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: "var(--surface-2)", color: "var(--muted)" }}
            >
              The dashboard is still responding and hasn&apos;t restarted, so this probably didn&apos;t
              start. Nothing has been broken — reload and check whether the change was applied.
            </p>
            <button type="button" className="btn btn-primary text-sm" onClick={() => window.location.reload()}>
              Reload the page
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
