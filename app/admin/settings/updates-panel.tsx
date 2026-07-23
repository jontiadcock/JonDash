"use client";

import { dismissUpdateFailureAction } from "./actions";
import type { UpdateFailure } from "@/lib/update-prefs";

/**
 * Which version of JonDash you are running — and nothing else.
 *
 * This card used to also hold the channel selector, the auto-install tick, a "Check for
 * updates" button and an "Update now" button. Each of those now has exactly one home:
 * the channel is a switch under **Beta channels**, auto-install is the **Automatic
 * updates** switch, and checking/applying lives in **Available updates**. Keeping copies
 * here meant the same setting could be changed in two places and read differently in each.
 */
export function UpdatesPanel({
  version,
  channel,
  failure,
}: {
  version: string;
  channel: string;
  failure: UpdateFailure | null;
}) {
  return (
    <div className="flex flex-col gap-4">
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
            v{failure.revertedTo}. It won&apos;t be retried automatically — use{" "}
            <strong>Available updates</strong> below to try again.
          </p>
          <form action={dismissUpdateFailureAction} className="mt-2">
            <button type="submit" className="btn btn-ghost !py-1 !px-2 text-xs">Dismiss</button>
          </form>
        </div>
      )}

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        On the <strong>{channel}</strong> channel. Change it under <strong>Beta channels</strong> below.
      </p>
    </div>
  );
}
