import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { browseAvailableModules, type ModuleChannel } from "@/lib/modules/sources";
import { PERMISSION_WARNINGS, DANGEROUS_PERMISSIONS } from "@/lib/modules/types";
import { InstallButton } from "./install-button";

export const dynamic = "force-dynamic";

export default async function BrowseModulesPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  await requirePermission("modules.manage");
  const { channel: raw } = await searchParams;
  const channel: ModuleChannel = raw === "beta" ? "beta" : "stable";

  const { modules, errors } = await browseAvailableModules(channel);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Link href="/admin/modules" className="text-sm" style={{ color: "var(--muted)" }}>
          ← Modules
        </Link>
        <h1 className="mb-1 mt-1 text-2xl font-semibold tracking-tight">Browse modules</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Modules published by your enabled{" "}
          <Link href="/admin/modules/sources" style={{ color: "var(--primary)" }}>sources</Link>. Review what a
          module can do before installing it.
        </p>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-sm" style={{ color: "var(--muted)" }}>Channel:</span>
        <Link
          href="/admin/modules/browse?channel=stable"
          className={channel === "stable" ? "btn btn-primary !py-1.5 text-sm" : "btn btn-ghost !py-1.5 text-sm"}
        >
          Stable
        </Link>
        <Link
          href="/admin/modules/browse?channel=beta"
          className={channel === "beta" ? "btn btn-primary !py-1.5 text-sm" : "btn btn-ghost !py-1.5 text-sm"}
        >
          Beta
        </Link>
      </div>

      {errors.length > 0 && (
        <div
          className="rounded-xl border p-3 text-sm"
          style={{ borderColor: "var(--danger)", background: "color-mix(in srgb, var(--danger) 8%, transparent)" }}
        >
          {errors.map((e, i) => (
            <p key={i}>
              <strong>{e.source}:</strong> {e.message}
            </p>
          ))}
        </div>
      )}

      {modules.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No modules are published on the <strong>{channel}</strong> channel by your enabled sources yet.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {modules.map((m) => (
            <div key={`${m.sourceId}:${m.id}`} className="card flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.name}</span>
                    <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>v{m.version}</span>
                    {m.installed && (
                      <span className="rounded px-1.5 py-0.5 text-xs" style={{ color: "var(--muted)" }}>
                        installed{m.installedVersion ? ` (v${m.installedVersion})` : ""}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{m.description}</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                    from {m.sourceName} · needs JonDash {m.minAppVersion}+
                  </p>
                </div>
                <div className="flex-none">
                  <InstallButton
                    sourceId={m.sourceId}
                    moduleId={m.id}
                    channel={channel}
                    installed={m.installed}
                  />
                </div>
              </div>

              <div className="rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
                <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>Permissions it requests</p>
                {m.permissions.length === 0 ? (
                  <p className="mt-1 text-sm">None beyond the basics (its own settings and data).</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-1 text-sm">
                    {m.permissions.map((p) => (
                      <li key={p} style={DANGEROUS_PERMISSIONS.has(p) ? { color: "var(--danger)" } : undefined}>
                        {DANGEROUS_PERMISSIONS.has(p) ? "⚠ " : "• "}
                        {PERMISSION_WARNINGS[p]}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Installing checks the module against JonDash&apos;s safety rules, then rebuilds and restarts the app so
        its code is compiled in — everyone signed in will need to sign in again. If a module can&apos;t build,
        JonDash removes it and starts up without it.
      </p>
    </div>
  );
}
