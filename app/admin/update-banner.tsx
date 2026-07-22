"use client";

import { useEffect, useState } from "react";
import { ServerWaitOverlay } from "@/app/components/server-wait-overlay";

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
  const [overlayBoot, setOverlayBoot] = useState<number | null | undefined>(undefined);
  // Modules never auto-update, so an available one has to be surfaced here — otherwise
  // the only way to find out is to go looking, which is the thing the user ruled out.
  const [moduleUpdates, setModuleUpdates] = useState(0);

  // Check once on mount.
  useEffect(() => {
    let active = true;
    fetch("/api/update/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!active || !s) return;
        if (s.failure) setFailure(s.failure as UpdateFailure);
        if (typeof s.moduleUpdates === "number") setModuleUpdates(s.moduleUpdates);
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
    let oldBoot: number | null = null;
    try {
      const res = await fetch("/api/update/apply", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Update could not be started.");
        setPhase("error");
        return;
      }
      const body = (await res.json().catch(() => null)) as { boot?: number } | null;
      if (typeof body?.boot === "number") oldBoot = body.boot;
    } catch {
      // The connection may drop as the server exits — the overlay falls back to down-detection.
    }
    // Full-screen "updating…" cover; polls /api/health, returns to /login when back.
    setOverlayBoot(oldBoot);
  }

  if (overlayBoot !== undefined) {
    return <ServerWaitOverlay mode="updating" oldBoot={overlayBoot} />;
  }

  // Also render when only MODULE updates are waiting: they never install themselves, so
  // this banner is the thing that makes them known without the admin going looking.
  if (phase === "idle" && !failure && moduleUpdates === 0) return null;

  return (
    <div className="mx-auto mt-4 flex w-full max-w-6xl flex-col gap-2 px-4" role="status">
      {moduleUpdates > 0 && phase !== "updating" && (
        <div className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border-strong)" }}>
          <strong>
            {moduleUpdates} module update{moduleUpdates === 1 ? " is" : "s are"} available
          </strong>
          <span style={{ color: "var(--muted)" }}>
            {" "}
            — modules are never updated automatically.{" "}
            <a href="/admin/updates" style={{ color: "var(--primary)" }}>Review them</a>.
          </span>
        </div>
      )}
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
