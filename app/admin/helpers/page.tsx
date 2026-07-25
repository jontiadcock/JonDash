import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { listHelpersForAdmin } from "@/lib/helpers/registry";

export const dynamic = "force-dynamic";

/**
 * Helpers — deliberately READ-ONLY.
 *
 * Helpers are first-party code that does the privileged work modules are forbidden, and
 * they exist only because a module asked for them. So there is nothing to install, import
 * or remove here: the page's job is to answer "what is this, and why is it on my system?"
 */
export default async function AdminHelpersPage() {
  // Kept, not discarded: a panel's context carries the admin core resolved from the session,
  // never a value a caller supplied. That distinction is the point of the whole feature.
  const session = await requirePermission("modules.manage");
  const admin = { id: session.id, email: session.email, role: session.role };
  const helpers = await listHelpersForAdmin();
  const inUse = helpers.filter((h) => h.dependents.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Helpers</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Shared capabilities that modules rely on — a scheduler for background work, and similar. They come
          with JonDash, are used only when a module asks for one, and can&apos;t be added or removed by hand.
          Their versions and beta channels live on{" "}
          <Link href="/admin/updates" style={{ color: "var(--primary)" }}>Admin → Updates</Link>.
        </p>
      </section>

      {inUse.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          None of your modules need a helper right now.{" "}
          <Link href="/admin/modules" style={{ color: "var(--primary)" }}>Modules</Link> lists what you have
          installed.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
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

              {/* Admin-owned configuration is edited HERE and nowhere else.
                  A helper whose safety rests on an admin-approved list previously had no home
                  for that list, so it exposed an editor through a consuming module — and the
                  module could then edit the very list meant to bound it. This page is behind
                  `modules.manage`, and the panel saves through `saveHelperSettingsAction`,
                  which re-checks before the helper is reached. No module is in the path. */}
              <div className="rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
                <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>Settings</p>
                {def.SettingsPanel ? (
                  <div className="mt-2">
                    <def.SettingsPanel ctx={{ helperId: def.id, user: admin }} />
                  </div>
                ) : (
                  <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                    This helper has no settings.
                  </p>
                )}
              </div>

              <div className="rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
                <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>Used by</p>
                <ul className="mt-1 flex flex-col gap-1 text-sm">
                  {dependents.map((d) => (
                    <li key={d.id}>
                      <Link href={`/admin/modules/${d.id}`} style={{ color: "var(--primary)" }}>{d.name}</Link>
                    </li>
                  ))}
                </ul>
                {(def.provides?.length ?? 0) > 0 && (
                  <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                    Modules using this helper must ask your permission for what it can do — you&apos;ll see
                    that on the module before it&apos;s installed.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {helpers.length > inUse.length && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {helpers.length - inUse.length} other helper
          {helpers.length - inUse.length === 1 ? " is" : "s are"} available but not currently needed by any
          module, so {helpers.length - inUse.length === 1 ? "it isn't" : "they aren't"} running.
        </p>
      )}
    </div>
  );
}
