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
  await requirePermission("modules.manage");
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

              {/* Channel and update controls moved to Admin → Updates (Beta channels), so
                  this page can be about the helper itself. Reserved for helper settings
                  once the contract carries them — no helper declares any yet. */}
              <div className="rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
                <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>Settings</p>
                <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                  This helper has no settings.
                </p>
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
