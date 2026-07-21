"use client";

import { useEffect, useState } from "react";

type Phase = "idle" | "available" | "updating" | "error";

type Release = { version: string; type: string; criticality: string; summary: string };
type UpdateFailure = { failedVersion: string; revertedTo: string; at: string };

const TYPE_LABEL: Record<string, string> = {
  major: "Major update",
  minor: "Minor update",
  patch: "Security / bug-fix",
};

const CRIT_COLOR: Record<string, string> = {
  critical: "#dc2626",
  recommended: "#d97706",
  optional: "var(--muted)",
};

export function UpdateBanner() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [current, setCurrent] = useState<string | null>(null);
  const [release, setRelease] = useState<Release | null>(null);
  const [channel, setChannel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<UpdateFailure | null>(null);

  // Check once on mount.
  useEffect(() => {
    let active = true;
    fetch("/api/update/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!active || !s) return;
        if (s.failure) setFailure(s.failure as UpdateFailure);
        if (s.updateAvailable && s.release) {
          setCurrent(s.current ?? null);
          setRelease(s.release);
          setChannel(s.channel ?? null);
          setPhase("available");
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

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
      // Server is restarting (pull + rebuild). Poll until it's back, then reload.
      waitForRestart();
    } catch {
      // The connection may drop as the server exits — treat as restart in progress.
      waitForRestart();
    }
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

  if (phase === "idle" && !failure) return null;

  return (
    <div className="mx-auto mt-4 flex w-full max-w-6xl flex-col gap-2 px-4" role="status">
      {failure && (
        <div
          className="rounded-xl border p-3 text-sm"
          style={{ borderColor: "var(--danger)", background: "color-mix(in srgb, var(--danger) 8%, transparent)" }}
        >
          <strong style={{ color: "var(--danger)" }}>The last update failed and was rolled back</strong>
          <span style={{ color: "var(--muted)" }}>
            {" "}
            — v{failure.failedVersion} didn&apos;t start, so v{failure.revertedTo} was restored. Update
            manually from <a href="/admin/updates" style={{ color: "var(--primary)" }}>Settings → Updates</a>.
          </span>
        </div>
      )}
      {phase !== "idle" && (
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"
        style={{ borderColor: "var(--primary)", background: "color-mix(in srgb, var(--primary) 10%, transparent)" }}
      >
        {phase === "available" && release && (
          <>
            <span className="min-w-0">
              <strong>Update available — v{release.version}</strong>
              {current ? <span style={{ color: "var(--muted)" }}> (you have v{current})</span> : null}
              {channel === "beta" && (
                <span className="ml-2 rounded px-1.5 py-0.5 text-xs font-medium" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
                  beta channel
                </span>
              )}
              <span className="ml-2 rounded px-1.5 py-0.5 text-xs" style={{ background: "var(--surface-2)" }}>
                {TYPE_LABEL[release.type] ?? release.type}
              </span>
              <span
                className="ml-2 rounded px-1.5 py-0.5 text-xs font-medium"
                style={{ color: CRIT_COLOR[release.criticality] ?? "var(--muted)" }}
              >
                {release.criticality} priority
              </span>
              <span className="mt-1 block text-xs" style={{ color: "var(--muted)" }}>
                {release.summary}
              </span>
            </span>
            <button type="button" className="btn btn-primary !py-1.5 text-sm" onClick={applyUpdate}>
              Update now
            </button>
          </>
        )}
        {phase === "updating" && (
          <span>Updating and restarting… this page will reconnect automatically in a moment.</span>
        )}
        {phase === "error" && (
          <span className="form-error">{error}</span>
        )}
      </div>
      )}
    </div>
  );
}
