import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { browseAvailableModules, ensureDefaultSource, listSources, type ModuleChannel } from "@/lib/modules/sources";
import { permissionRisk } from "@/lib/modules/types";
import { compareVersions } from "@/lib/version";
import { getAppVersion } from "@/lib/update";
import { BrowseGrid, type BrowseCard } from "./browse-grid";
import { QueuedInstallBar } from "./queued-install-bar";

export const dynamic = "force-dynamic";

export default async function BrowseModulesPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; page?: string }>;
}) {
  await requirePermission("modules.manage");
  const { channel: raw, page: rawPage } = await searchParams;
  const channel: ModuleChannel = raw === "beta" ? "beta" : "stable";
  const page = Math.max(1, Number(rawPage) || 1);

  // On a fresh install ModuleSource is empty, so this page used to read "nothing is
  // published" — which sounds like the source has no modules, not like it was never set
  // up. Seed it here too, and distinguish the two states below.
  await ensureDefaultSource();
  const sourceCount = (await listSources()).filter((s) => s.enabled).length;
  const { modules, errors } = await browseAvailableModules(channel);

  /*
   * Flattened to plain data so the grid can be a client component — which it must be, because
   * pagination and the saved page size are browser concerns. Nothing here needs rendering on the
   * server: a card is a name, a sentence and a chip.
   *
   * The risk chip is computed from the module's own permissions PLUS everything its helpers can
   * do, keyed by id so a capability the module also declared isn't counted twice. Consent driven
   * only by the module's own list would understate what taking the helper actually allows.
   */
  const appVersion = getAppVersion();
  const cards: BrowseCard[] = modules.map((m) => {
    const labels = Object.fromEntries(m.helperCapabilities.map((c) => [c.id, c.label]));
    const ids = [...new Set([...m.permissions, ...m.helperCapabilities.map((c) => c.id)])];
    return {
      id: m.id,
      name: m.name,
      version: m.version,
      description: m.description,
      sourceName: m.sourceName,
      installed: m.installed,
      installedVersion: m.installedVersion,
      minAppVersion: m.minAppVersion,
      // MOD-05 leftover: an entry this build is too old for is shown greyed and says why, rather
      // than being hidden — "why isn't it listed?" is a worse question than "why is it dimmed?".
      tooOld: compareVersions(m.minAppVersion, appVersion) > 0,
      risk: permissionRisk(ids, labels),
    };
  });

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
          {sourceCount === 0
            ? "You have no module sources set up yet, so there is nothing to browse."
            : `No modules are published on the ${channel} channel by your enabled sources yet.`}
          <br />
          If you&apos;ve just published one, give it a couple of minutes — GitHub caches the list briefly, so a
          brand-new module can take a moment to appear here.
        </p>
      ) : (
        <>
          <BrowseGrid items={cards} channel={channel} page={page} />
          {/* The batch, wherever you built it up from. Sits below the grid so it is visible on
              the page you return to after queueing something. */}
          <QueuedInstallBar channel={channel} names={Object.fromEntries(cards.map((c) => [c.id, c.name]))} />
        </>
      )}

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Installing checks the module against JonDash&apos;s safety rules, then rebuilds and restarts the app so
        its code is compiled in — everyone signed in will need to sign in again. If a module can&apos;t build,
        JonDash removes it and starts up without it.
      </p>
    </div>
  );
}
