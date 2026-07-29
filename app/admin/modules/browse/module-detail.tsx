import { browseAvailableModules, type ModuleChannel } from "@/lib/modules/sources";
import { describePermission } from "@/lib/modules/types";
import { compareVersions } from "@/lib/version";
import { getAppVersion } from "@/lib/update";
import { ModuleActions } from "./[id]/module-actions";
import { Screenshots } from "./screenshots";

/**
 * One module's detail, rendered identically whether it arrives as a full page or as the overlay
 * that expands over the catalogue.
 *
 * **Shared on purpose.** The overlay and the page are two routes for the same thing — a card
 * clicked from the grid opens over it, while a pasted link or a refresh renders the whole page.
 * Two copies of a consent screen is exactly the kind of duplication that ends with one of them
 * quietly listing fewer permissions than the other, so there is one.
 *
 * Returns `null` when the id is not in this channel's manifest; the callers decide what that
 * means (a 404 for the page, nothing for the overlay).
 */
export async function loadModule(id: string, channel: ModuleChannel) {
  const { modules } = await browseAvailableModules(channel);
  return modules.find((x) => x.id === id) ?? null;
}

export function ModuleDetail({
  m,
  channel,
}: {
  m: NonNullable<Awaited<ReturnType<typeof loadModule>>>;
  channel: ModuleChannel;
}) {
  const tooOld = compareVersions(m.minAppVersion, getAppVersion()) > 0;

  // The module's own permissions PLUS everything its helpers can do, keyed by id so a capability
  // the module also declared is not listed twice. A module earns the right to use a helper by
  // DECLARING the helper, not by declaring a permission — so a list built from its own
  // declarations alone would understate what accepting it allows.
  const labels = Object.fromEntries(m.helperCapabilities.map((c) => [c.id, c.label]));
  const permissionIds = [...new Set([...m.permissions, ...m.helperCapabilities.map((c) => c.id)])];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{m.name}</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            v{m.version} · from {m.sourceName} · needs JonDash {m.minAppVersion}+
          </p>
        </div>
        <ModuleActions
          id={m.id}
          name={m.name}
          channel={channel}
          installed={m.installed}
          installedVersion={m.installedVersion}
          tooOld={tooOld}
          helpers={m.helpers}
        />
      </section>

      {tooOld && (
        <div
          className="rounded-xl border p-3 text-sm"
          style={{ borderColor: "var(--warning)", background: "color-mix(in srgb, var(--warning) 10%, transparent)" }}
        >
          This module needs JonDash <strong>{m.minAppVersion}</strong> or newer, and this install is
          on {getAppVersion()}. Update JonDash first and it will become installable.
        </div>
      )}

      <section>
        <h2 className="mb-1 text-sm font-semibold">About</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {m.description}
        </p>
      </section>

      {/* Above the permissions but below the description: enough to see what it looks like, before
          the part that decides whether you want it. Absent entirely when a module publishes none. */}
      {m.screenshots && m.screenshots.length > 0 && (
        <Screenshots moduleId={m.id} channel={channel} shots={m.screenshots} />
      )}

      <section>
        <h2 className="mb-1 text-sm font-semibold">What it can do</h2>
        {permissionIds.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Nothing beyond the basics every module gets: its own settings, its own data, and its own
            tables. It cannot reach the network, your accounts, or anything another module owns.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {permissionIds.map((p) => {
              const { text, dangerous } = describePermission(p, labels);
              return (
                <li
                  key={p}
                  className="rounded-lg p-3"
                  style={
                    dangerous
                      ? { color: "var(--danger)", background: "color-mix(in srgb, var(--danger) 8%, transparent)" }
                      : { background: "var(--surface-2)" }
                  }
                >
                  {dangerous ? "⚠ " : "• "}
                  {text}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {m.helpers.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-semibold">Shared capabilities it needs</h2>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Installing this also installs {m.helpers.join(", ")}, which it needs to work. Those are
            first-party and shared — one arrives with the module that needs it and goes when nothing
            does.
          </p>
        </section>
      )}

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Installing checks the module against JonDash&apos;s safety rules, then rebuilds and restarts
        the app so its code is compiled in — everyone signed in will need to sign in again. If a
        module can&apos;t build, JonDash removes it and starts up without it.
      </p>
    </div>
  );
}
