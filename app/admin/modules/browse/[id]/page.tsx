import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { browseAvailableModules, type ModuleChannel } from "@/lib/modules/sources";
import { describePermission } from "@/lib/modules/types";
import { compareVersions } from "@/lib/version";
import { getAppVersion } from "@/lib/update";
import { ModuleActions } from "./module-actions";

export const dynamic = "force-dynamic";

/**
 * One module's page (design B1) — a single reading column, opened from a card in the catalogue.
 *
 * **This is where consent happens, and it is the reason the page exists.** The catalogue shows a
 * chip saying roughly how much access a module wants; the full list of what it can actually do
 * lives here, and so do the install actions. Neither queueing nor installing is possible without
 * passing through this page, which is the property the previous design lacked — a checkbox on
 * every row let a module be installed without its permissions ever having been on screen.
 *
 * **Back returns you to the page of the catalogue you left** (8.4), which is why `channel` and
 * `page` are carried in the query string rather than held in component state: a full navigation
 * would lose state, and coming back to page 1 after browsing to page 4 is its own small betrayal.
 *
 * **No screenshots yet.** They are a manifest contract the add-ons repo has agreed but not built
 * (`screenshots: [{file, caption}]`, resolved by core against the pinned tag). The section is
 * absent rather than an empty placeholder until modules actually publish them.
 */
export default async function ModuleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ channel?: string; page?: string }>;
}) {
  await requirePermission("modules.manage");
  const { id } = await params;
  const { channel: rawChannel, page } = await searchParams;
  const channel: ModuleChannel = rawChannel === "beta" ? "beta" : "stable";

  const { modules } = await browseAvailableModules(channel);
  const m = modules.find((x) => x.id === id);
  // A module that is not in this channel's manifest genuinely is not here — an id in the URL is
  // not evidence it exists, and inventing a page for one would be worse than saying so.
  if (!m) notFound();

  const backHref = `/admin/modules/browse?channel=${channel}${page ? `&page=${encodeURIComponent(page)}` : ""}`;
  const tooOld = compareVersions(m.minAppVersion, getAppVersion()) > 0;

  // The module's own permissions PLUS everything its helpers can do, keyed by id so a capability
  // the module also declared is not listed twice. A module earns the right to use a helper by
  // DECLARING the helper, not by declaring a permission — so a list built only from the module's
  // own declarations would understate what accepting it allows.
  const labels = Object.fromEntries(m.helperCapabilities.map((c) => [c.id, c.label]));
  const permissionIds = [...new Set([...m.permissions, ...m.helperCapabilities.map((c) => c.id)])];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href={backHref} className="text-sm" style={{ color: "var(--muted)" }}>
        ← Browse modules
      </Link>

      {/* Actions pinned top-right of the header, so the decision is reachable without scrolling
          past the permissions — but the permissions are still what the page is mostly made of. */}
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
                      ? {
                          color: "var(--danger)",
                          background: "color-mix(in srgb, var(--danger) 8%, transparent)",
                        }
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
