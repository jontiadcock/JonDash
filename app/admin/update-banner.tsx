"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Release = { version: string; type: string; criticality: string; summary: string };
type UpdateFailure = { failedVersion: string; revertedTo: string; at: string };

// Criticality → colour + word. Only JonDash's own releases carry a criticality; module and
// helper manifests don't, so a set of updates with no core release shows no word and the
// low-key green (the owner's rule: if there's no criticality, say nothing about it).
const CRIT: Record<string, { color: string; label: string }> = {
  critical: { color: "#dc2626", label: "Important" },
  recommended: { color: "#d97706", label: "Recommended" },
  optional: { color: "#16a34a", label: "Optional" },
};
const NEUTRAL = "#16a34a"; // green — updates waiting, nothing flagged as urgent

export function UpdateBanner() {
  const [coreRelease, setCoreRelease] = useState<Release | null>(null);
  const [moduleUpdates, setModuleUpdates] = useState(0);
  const [helperUpdates, setHelperUpdates] = useState(0);
  const [failure, setFailure] = useState<UpdateFailure | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/update/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!active || !s) return;
        if (s.failure) setFailure(s.failure as UpdateFailure);
        setModuleUpdates(typeof s.moduleUpdates === "number" ? s.moduleUpdates : 0);
        setHelperUpdates(typeof s.helperUpdates === "number" ? s.helperUpdates : 0);
        if (s.updateAvailable && s.release) setCoreRelease(s.release as Release);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const total = (coreRelease ? 1 : 0) + moduleUpdates + helperUpdates;
  const crit = coreRelease ? CRIT[coreRelease.criticality] ?? null : null;
  const color = crit?.color ?? NEUTRAL;

  if (total === 0 && !failure) return null;

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
            — v{failure.failedVersion} didn&apos;t start, so v{failure.revertedTo} was restored.{" "}
            <Link href="/admin/updates" style={{ color: "var(--primary)" }}>Open Updates</Link>.
          </span>
        </div>
      )}
      {total > 0 && (
        <Link
          href="/admin/updates"
          aria-label={`${total} update${total === 1 ? "" : "s"} available — open Updates`}
          className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm no-underline hover:brightness-105"
          style={{ borderColor: color, background: `color-mix(in srgb, ${color} 12%, transparent)`, color: "var(--foreground)" }}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: color }} aria-hidden />
            <strong>
              You have {total} update{total === 1 ? "" : "s"} available
            </strong>
            {crit && (
              <span className="flex-none font-semibold" style={{ color }}>
                · {crit.label}
              </span>
            )}
          </span>
          <span className="flex-none font-medium" style={{ color }}>
            Review →
          </span>
        </Link>
      )}
    </div>
  );
}
