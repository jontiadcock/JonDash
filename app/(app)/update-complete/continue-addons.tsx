"use client";

import { useEffect, useRef, useState } from "react";
import { applyQueuedAddonUpdatesAction } from "@/app/admin/updates/selection-actions";
import { ServerWaitOverlay } from "@/app/components/server-wait-overlay";

/**
 * Stage two of "Update everything": JonDash has just updated and come back, and a queue of add-on
 * updates was left for this moment.
 *
 * ⚠ Runs from this page, never at boot. Applying add-ons exits the process to rebuild, and doing
 * that from server start-up risks a boot loop on a bad module. Driven from a page the admin is
 * watching, a failure is reported rather than retried.
 * REFS app/admin/updates/selection-actions.ts › applyQueuedAddonUpdatesAction() — consumes the
 *      queue · app/(app)/update-complete/page.tsx — the only caller
 */
export function ContinueAddons() {
  const [phase, setPhase] = useState<"starting" | "applying" | "failed">("starting");
  const [error, setError] = useState<string | null>(null);
  // ⚠ Strict Mode mounts effects twice in development, and the queue is consumed on read — a
  // second call finds nothing and reports a spurious failure.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      setPhase("applying");
      try {
        const res = await applyQueuedAddonUpdatesAction();
        // Success exits the process to rebuild, so this usually never resolves — the overlay
        // waits for the new server. Reaching here means the add-ons could not be applied.
        if (res?.error) {
          setError(res.error);
          setPhase("failed");
        }
      } catch {
        // The connection dropping IS the success path: the server is going down to rebuild.
      }
    })();
  }, []);

  if (phase === "failed") {
    return (
      <div
        className="mx-auto max-w-md rounded-lg border p-3 text-sm"
        style={{ borderColor: "var(--warning, var(--border-strong))", background: "color-mix(in srgb, var(--warning, #c07a12) 8%, transparent)" }}
      >
        <p className="font-medium">JonDash updated, but its add-ons didn&apos;t.</p>
        <p className="mt-1" style={{ color: "var(--muted)" }}>
          {/* The reason comes from the update machinery and rarely ends in punctuation, so
              give it a full stop rather than running it into the next sentence. */}
          {error?.replace(/[.\s]*$/, "")}. You can update them from <strong>Admin → Updates</strong> —
          JonDash itself is fine.
        </p>
      </div>
    );
  }

  // Applying: the same full-screen cover the rest of the update used, so the two stages look
  // like one continuous operation rather than the page appearing to finish and then move again.
  return <ServerWaitOverlay mode="modules" oldBoot={null} />;
}
