"use client";

import { useEffect, useState } from "react";

type Phase = "idle" | "available" | "updating" | "error";

type Release = { version: string; type: string; criticality: string; summary: string };

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

  // Check once on mount.
  useEffect(() => {
    let active = true;
    fetch("/api/update/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (active && s?.updateAvailable && s.release) {
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
    const timer = setInterval(async () => {
      tries += 1;
      try {
        const r = await fetch("/api/update/status", { cache: "no-store" });
        if (r.ok) {
          clearInterval(timer);
          window.location.reload();
        }
      } catch {
        /* still down, keep waiting */
      }
      if (tries > 120) clearInterval(timer); // give up after ~4 min
    }, 2000);
  }

  if (phase === "idle") return null;

  return (
    <div
      className="mx-auto mt-4 w-full max-w-6xl px-4"
      role="status"
    >
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
    </div>
  );
}
