"use client";

import { useActionState, useState } from "react";
import {
  saveUpdateChannelAction,
  saveAutoInstallAction,
  dismissUpdateFailureAction,
  type ChannelState,
  type AutoInstallState,
} from "./actions";

type UpdateFailure = { failedVersion: string; revertedTo: string; at: string };

type Release = { version: string; type: string; criticality: string; summary: string };
type Status = {
  updateAvailable: boolean;
  current: string;
  latest: string | null;
  release: Release | null;
  channel: string;
  reason?: string;
};

const TYPE_LABEL: Record<string, string> = {
  major: "Major update",
  minor: "Minor update",
  patch: "Security / bug-fix",
};

const initial: ChannelState = {};

export function UpdatesPanel({
  version,
  channel,
  autoInstall,
  failure,
}: {
  version: string;
  channel: string;
  autoInstall: boolean;
  failure: UpdateFailure | null;
}) {
  const [chanState, chanAction, chanPending] = useActionState(saveUpdateChannelAction, initial);
  // After a save the server prop is stale until reload, so prefer the just-saved value.
  const currentChannel = chanState.channel ?? channel;

  const [autoState, autoAction] = useActionState<AutoInstallState, FormData>(saveAutoInstallAction, {});

  const [phase, setPhase] = useState<"idle" | "checking" | "result" | "updating" | "error">("idle");
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setPhase("checking");
    setError(null);
    try {
      const res = await fetch("/api/update/status?force=1", { cache: "no-store" });
      if (!res.ok) throw new Error("Check failed.");
      setStatus((await res.json()) as Status);
      setPhase("result");
    } catch {
      setError("Couldn't check for updates. Try again in a moment.");
      setPhase("error");
    }
  }

  async function applyUpdate() {
    setPhase("updating");
    setError(null);
    try {
      const res = await fetch("/api/update/apply", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Update could not be started.");
        setPhase("error");
        return;
      }
    } catch {
      /* connection may drop as the server exits — treat as restart in progress */
    }
    waitForRestart();
  }

  function waitForRestart() {
    setPhase("updating");
    let tries = 0;
    let sawDown = false;
    const timer = setInterval(async () => {
      tries += 1;
      try {
        // Any response means the server is answering again. The restart signs
        // everyone out, so /api/update/status returns 403 (not 2xx) — we can't
        // wait for r.ok. Only treat a response as "back" once we've first seen
        // the server go down, so we don't reload against the old process before
        // it exits. Then go to /login (the restart ended the session).
        await fetch("/api/update/status", { cache: "no-store" });
        if (sawDown) {
          clearInterval(timer);
          window.location.href = "/login";
        }
      } catch {
        sawDown = true; // server is down (restarting)
      }
      if (tries > 150) clearInterval(timer); // give up after ~5 min
    }, 2000);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-sm" style={{ color: "var(--muted)" }}>Installed version</span>
        <span className="font-mono text-sm">v{version}</span>
      </div>

      {failure && (
        <div
          className="rounded-xl border p-3 text-sm"
          style={{ borderColor: "var(--danger)", background: "color-mix(in srgb, var(--danger) 8%, transparent)" }}
        >
          <p className="font-medium" style={{ color: "var(--danger)" }}>
            The last update failed and was rolled back.
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            Updating to v{failure.failedVersion} didn&apos;t start cleanly, so JonDash restored
            v{failure.revertedTo}. It won&apos;t be retried automatically — use &ldquo;Update now&rdquo;
            below to try again manually.
          </p>
          <form action={dismissUpdateFailureAction} className="mt-2">
            <button type="submit" className="btn btn-ghost !py-1 !px-2 text-xs">Dismiss</button>
          </form>
        </div>
      )}

      <form action={chanAction} className="flex flex-col gap-2">
        <label className="label" htmlFor="channel">Update channel</label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            id="channel"
            name="channel"
            key={currentChannel}
            defaultValue={currentChannel}
            className="input sm:max-w-xs"
          >
            <option value="stable">Stable — tested releases (recommended)</option>
            <option value="beta">Beta — pre-release builds, early access</option>
          </select>
          <button type="submit" className="btn btn-primary" disabled={chanPending}>
            {chanPending ? "Saving…" : "Save channel"}
          </button>
          {chanState.ok && <span className="text-sm" style={{ color: "var(--primary)" }}>Saved.</span>}
          {chanState.error && <span className="form-error">{chanState.error}</span>}
        </div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Beta receives pre-release builds early and may be less stable. Takes effect on the next
          update check. Currently on the <strong>{currentChannel}</strong> channel.
        </p>
      </form>

      <form action={autoAction} className="flex flex-col gap-1">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="autoInstall"
            defaultChecked={autoInstall}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="h-4 w-4"
          />
          <span className="text-sm font-medium">Automatically install updates when available</span>
          {autoState.ok && <span className="text-sm" style={{ color: "var(--primary)" }}>Saved.</span>}
        </label>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Off by default — JonDash only tells you an update is available and you install it here with
          &ldquo;Update now&rdquo;. When on, the launcher installs updates automatically at startup.
        </p>
      </form>

      <div className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={check}
            disabled={phase === "checking" || phase === "updating"}
          >
            {phase === "checking" ? "Checking…" : "Check for updates"}
          </button>

          {phase === "result" && status && !status.updateAvailable && (
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              {status.reason
                ? status.reason
                : `You're up to date (v${status.current} · ${status.channel} channel).`}
            </span>
          )}
          {phase === "updating" && (
            <span className="text-sm">Updating and restarting… this page reconnects automatically.</span>
          )}
          {phase === "error" && <span className="form-error">{error}</span>}
        </div>

        {phase === "result" && status?.updateAvailable && status.release && (
          <div
            className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"
            style={{ borderColor: "var(--primary)", background: "color-mix(in srgb, var(--primary) 10%, transparent)" }}
          >
            <span className="min-w-0">
              <strong>Update available — v{status.release.version}</strong>
              <span style={{ color: "var(--muted)" }}> (you have v{status.current})</span>
              <span className="ml-2 rounded px-1.5 py-0.5 text-xs" style={{ background: "var(--surface-2)" }}>
                {TYPE_LABEL[status.release.type] ?? status.release.type}
              </span>
              <span className="mt-1 block text-xs" style={{ color: "var(--muted)" }}>
                {status.release.summary}
              </span>
            </span>
            <button type="button" className="btn btn-primary !py-1.5 text-sm" onClick={applyUpdate}>
              Update now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
