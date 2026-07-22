"use client";

import { RestartWarning } from "./restart-warning";
import { useRebuildWatch } from "./rebuild-watch";
import { rebuildForHelpersAction } from "./actions";

export type HelperGapView = {
  moduleId: string;
  moduleName: string;
  missing: string[];
  healed: string[];
  firstParty: boolean;
  reason?: string;
};

/**
 * Tells the admin a module is missing a helper it needs — and, for a first-party module,
 * that the helper has already been fetched and just needs a restart to take effect.
 *
 * The restart is deliberately a button rather than something that happens on its own: a
 * helper is a compile-time import, so activating it means a rebuild, and a module quietly
 * signing everyone out is the surprise the governing rule exists to prevent.
 */
export function HelperGapNotice({ gaps }: { gaps: HelperGapView[] }) {
  const { overlay, start } = useRebuildWatch();
  const healed = gaps.filter((g) => g.healed.length > 0);
  const broken = gaps.filter((g) => g.missing.length > 0);
  if (gaps.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {overlay}

      {healed.length > 0 && (
        <div
          className="flex flex-col gap-3 rounded-xl border p-4 text-sm"
          style={{ borderColor: "var(--border-strong)" }}
        >
          <div>
            <p>
              <strong>
                {healed.length === 1
                  ? `${healed[0].moduleName} was missing something it needs.`
                  : `${healed.length} modules were missing something they need.`}
              </strong>{" "}
              JonDash has downloaded{" "}
              {[...new Set(healed.flatMap((g) => g.healed))].join(", ")} for{" "}
              {healed.length === 1 ? "it" : "them"}.
            </p>
            <p className="mt-1" style={{ color: "var(--muted)" }}>
              Until JonDash restarts, {healed.length === 1 ? "this module's" : "these modules'"} background
              work still isn&apos;t running. Restart when it suits you — nothing else is affected.
            </p>
          </div>
          <RestartWarning what="Restart JonDash so the downloaded helpers become active." />
          <form action={rebuildForHelpersAction}>
            <button type="submit" className="btn btn-primary !py-1.5 text-sm" onClick={start}>
              Restart now
            </button>
          </form>
        </div>
      )}

      {broken.map((g) => (
        <div
          key={g.moduleId}
          className="rounded-xl border p-4 text-sm"
          style={{ borderColor: "var(--danger)", background: "color-mix(in srgb, var(--danger) 8%, transparent)" }}
        >
          <p>
            <strong>{g.moduleName} isn&apos;t working.</strong> It needs{" "}
            {g.missing.join(", ")}, which {g.missing.length === 1 ? "isn't" : "aren't"} installed, so its
            background work never runs.
          </p>
          {g.reason && (
            <p className="mt-1" style={{ color: "var(--muted)" }}>
              {g.reason}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
