import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { listHelpersForAdmin } from "@/lib/helpers/registry";

/**
 * The helpers section of Admin → Addons (CORE-10).
 *
 * **A separate list, deliberately.** Helpers are not peers of modules: they cannot be installed
 * or removed by hand — one arrives with a module that needs it and goes when nothing does. A
 * flat list mixing the two would imply a control that does not exist, which is the owner's
 * constraint on the merge and the reason this is its own section rather than more rows above.
 *
 * The two pages merged because a separate "Helpers" nav entry advertised management that was
 * never available. What is genuinely per-helper — its settings panel — stays here; what is
 * per (module, capability) lives on Admin → Addon Permissions.
 */
export async function SharedCapabilities() {
  const session = await requirePermission("modules.manage");
  const admin = { id: session.id, email: session.email, role: session.role };
  const helpers = await listHelpersForAdmin();
  const inUse = helpers.filter((h) => h.dependents.length > 0);

  if (inUse.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Shared capabilities</h2>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Privileged work that addons can&apos;t do themselves — controlling a Windows service, reaching
        the filesystem. They come with JonDash, arrive automatically with an addon that needs one, and
        go when nothing does. You can&apos;t add or remove them by hand. What each addon is allowed to
        use is on{" "}
        <Link href="/admin/permissions" style={{ color: "var(--primary)" }}>Addon Permissions</Link>.
      </p>

      {inUse.map(({ def, installed, installedVersion, dependents }) => (
        <div key={def.id} className="card flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{def.name}</span>
            <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
              v{installedVersion ?? def.version}
            </span>
            {!installed && (
              <span className="text-xs" style={{ color: "var(--muted)" }}>starts with the server</span>
            )}
          </div>
          <p className="text-sm" style={{ color: "var(--muted)" }}>{def.description}</p>

          {/* Admin-owned configuration is edited HERE and nowhere else. A helper once had no
              home for its allowlist, so it exposed an editor through a consuming module — and
              the module could then edit the list meant to bound it. */}
          {def.SettingsPanel && (
            <div className="rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
              <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>Settings</p>
              <div className="mt-2">
                <def.SettingsPanel ctx={{ helperId: def.id, user: admin }} />
              </div>
            </div>
          )}

          <div className="rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
            <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>Used by</p>
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {dependents.map((d) => (
                <li key={d.id}>
                  <Link href={`/admin/modules/${d.id}`} style={{ color: "var(--primary)" }}>{d.name}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </section>
  );
}
