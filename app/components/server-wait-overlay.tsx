"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

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

// How many consecutive healthy responses from the *new* process we want before we
// call it back, plus a short settle delay — so remote clients don't reconnect the
// instant the port opens (which can briefly fail) but once it's reliably reachable.
const REQUIRED_OKS = 3;
const POLL_MS = 1500;
const SETTLE_MS = 2500;
// If the server never even goes down, nothing is going to bring us back — surface that
// rather than spinning forever, which is indistinguishable from the app being broken.
const STALL_AFTER_MS = 90_000;

/**
 * Full-screen "please wait" cover shown after the admin triggers an update, restart,
 * or shutdown. For update/restart it polls the public /api/health probe and, once the
 * *new* server (a changed `boot`) answers reliably, sends the user to /login (the
 * restart ended every session). For shutdown it just explains the server is down.
 *
 * It's a pure client overlay with no server dependency of its own, so it keeps
 * rendering while the server is offline — the user should not refresh.
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
      window.location.href = "/login";
    };

    async function poll() {
      if (cancelled) return;
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const data = res.ok ? ((await res.json()) as { boot?: number }) : null;
        const boot = typeof data?.boot === "number" ? data.boot : null;
        // "New process" = a boot value different from the one before we restarted.
        // When we don't know the old boot, fall back to "answered again after we
        // saw it go down".
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
          // Answering happily as the SAME process long after we asked it to restart
          // means the restart never began. Don't spin silently.
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

  // Portalled into document.body (BUG-23). `fixed` is only viewport-relative while NO
  // ancestor has a transform — and every admin page is wrapped in `.page-fade`, whose
  // keyframes animate transform with `animation-fill-mode: both`, so the final transform is
  // retained forever. That made this cover the content column instead of the page, during
  // the exact moments it exists to say "don't touch anything".
  //
  // Guarded on `document` rather than a mounted-state flag: this only ever renders after a
  // client action (an update/restart the admin triggered), so the server render is always
  // null anyway, and `useEffect(() => setState(true))` is a cascading render the React
  // Compiler lint correctly refuses.
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
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: "var(--surface-2)", color: "var(--muted)" }}
            aria-hidden="true"
          >
            <span className="block h-4 w-4 rounded-sm" style={{ background: "var(--muted)" }} />
          </div>
        ) : (
          <div
            className="h-12 w-12 animate-spin rounded-full border-4"
            style={{ borderColor: "var(--surface-2)", borderTopColor: "var(--primary)" }}
            aria-hidden="true"
          />
        )}

        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {reconnecting ? "Reconnecting — taking you back to sign in…" : copy.body}
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
