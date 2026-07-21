"use client";

import { useState } from "react";
import { ServerWaitOverlay, type ServerWaitMode } from "@/app/components/server-wait-overlay";

type Action = "restart" | "shutdown";

export function ServerPowerPanel() {
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<{ mode: ServerWaitMode; oldBoot: number | null } | null>(null);

  async function run(action: Action) {
    setBusy(true);
    setError(null);
    let oldBoot: number | null = null;
    try {
      const res = await fetch(`/api/server/${action}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "That didn't work. Try again in a moment.");
        setBusy(false);
        setConfirming(null);
        return;
      }
      const body = (await res.json().catch(() => null)) as { boot?: number } | null;
      if (typeof body?.boot === "number") oldBoot = body.boot;
    } catch {
      /* connection may drop as the server exits — the overlay handles it */
    }
    setOverlay({ mode: action === "restart" ? "restarting" : "shutdown", oldBoot });
  }

  if (overlay) {
    return <ServerWaitOverlay mode={overlay.mode} oldBoot={overlay.oldBoot} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Restart */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">Restart server</p>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Stops and relaunches the dashboard. Everyone is signed out and comes back in a few
              seconds. Use this to apply a config change or clear a stuck state.
            </p>
          </div>
          {confirming === "restart" ? (
            <div className="flex flex-none items-center gap-2">
              <span className="text-sm">Restart now?</span>
              <button type="button" className="btn btn-primary !py-1.5 text-sm" disabled={busy} onClick={() => run("restart")}>
                {busy ? "Restarting…" : "Confirm"}
              </button>
              <button type="button" className="btn btn-ghost !py-1.5 text-sm" disabled={busy} onClick={() => setConfirming(null)}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-ghost flex-none"
              disabled={busy}
              onClick={() => {
                setError(null);
                setConfirming("restart");
              }}
            >
              Restart
            </button>
          )}
        </div>
      </div>

      {/* Shutdown */}
      <div className="border-t pt-6" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium" style={{ color: "var(--danger)" }}>
              Shut down server
            </p>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Stops the dashboard completely. It will <strong>not</strong> come back on its own — you
              can only start it again from the server PC (run start-dashboard). Don&apos;t do this
              remotely unless you have access to that machine.
            </p>
          </div>
          {confirming === "shutdown" ? (
            <div className="flex flex-none items-center gap-2">
              <span className="text-sm">Shut down now?</span>
              <button type="button" className="btn btn-danger !py-1.5 text-sm" disabled={busy} onClick={() => run("shutdown")}>
                {busy ? "Shutting down…" : "Confirm"}
              </button>
              <button type="button" className="btn btn-ghost !py-1.5 text-sm" disabled={busy} onClick={() => setConfirming(null)}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-ghost flex-none"
              style={{ color: "var(--danger)" }}
              disabled={busy}
              onClick={() => {
                setError(null);
                setConfirming("shutdown");
              }}
            >
              Shut down
            </button>
          )}
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
