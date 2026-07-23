"use client";

import { setAutoUpdateEnabledAction, setAutoUpdateExcludedAction } from "./schedule-actions";
import { Slider } from "./slider";

export type AutoItem = {
  kind: "app" | "module" | "helper";
  id: string;
  name: string;
  excluded: boolean;
  /** Helpers only: it will be updated anyway when a module that needs it updates. */
  pulledIn?: boolean;
};

/**
 * Automatic updates: one master switch, then per-item exclusions (owner design, 2026-07-23).
 *
 * Replaces the per-item opt-in shipped in v1.5.3-beta.5. The trade is deliberate and worth
 * knowing: with this on, a module from ANY source you have added updates itself unless you
 * exclude it. Off by default for that reason.
 */
export function AutoUpdatePanel({
  enabled,
  items,
  scheduleSummary,
  scheduleForm,
}: {
  enabled: boolean;
  items: AutoItem[];
  scheduleSummary: string;
  /** The schedule, rendered here only once the switch is on — it means nothing while off.
      An ELEMENT, not a render function: a function can't cross the RSC boundary. */
  scheduleForm: React.ReactNode;
}) {
  const excluded = items.filter((i) => i.excluded).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg font-medium">Automatic updates</span>
        <form action={setAutoUpdateEnabledAction}>
          <input type="hidden" name="enabled" value={enabled ? "off" : "on"} />
          <Slider on={enabled} label="automatic updates" />
        </form>
      </div>

      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {enabled ? (
          <>
            {scheduleSummary}. Everything below updates itself unless you exclude it
            {excluded > 0 ? ` — ${excluded} excluded` : ""}. Applying an update restarts the dashboard
            and signs everyone out.
          </>
        ) : (
          <>Nothing updates itself. Turn this on to keep JonDash, your modules and their helpers current.</>
        )}
      </p>

      {enabled && (
        <div className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
          {scheduleForm}
        </div>
      )}

      {enabled && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>
            Exclude anything you would rather update yourself
          </p>
          {items.map((it) => (
            <form
              key={`${it.kind}:${it.id}`}
              action={setAutoUpdateExcludedAction}
              className="flex flex-wrap items-center gap-3 rounded-lg p-3"
              style={{ background: "var(--surface-2)" }}
            >
              <input type="hidden" name="kind" value={it.kind} />
              <input type="hidden" name="id" value={it.id} />
              <input type="hidden" name="excluded" value={it.excluded ? "off" : "on"} />

              <span className="min-w-0 flex-1">
                <span className="font-medium">{it.name}</span>
                <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
                  {it.kind === "app" ? "JonDash itself" : it.kind}
                </span>
                {it.excluded && it.pulledIn && (
                  <span className="mt-0.5 block text-xs" style={{ color: "var(--muted)" }}>
                    Still updated when a module that needs it updates — excluding it only stops it
                    being updated for its own sake.
                  </span>
                )}
              </span>

              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {it.excluded ? "Excluded" : "Included"}
              </span>
              <Slider on={it.excluded} label={`exclude ${it.name} from automatic updates`} danger />
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
