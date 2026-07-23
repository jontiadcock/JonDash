import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { getAppVersion, getUpdateStatus } from "@/lib/update";
import { readChannel } from "@/lib/update-channel";
import { readAutoInstall, readUpdateFailure } from "@/lib/update-prefs";
import { getModuleUpdateStatus } from "@/lib/modules/updates";
import { describePermission } from "@/lib/modules/types";
import { helperCapabilityLabels } from "@/lib/helpers/registry";
import { UpdatesPanel } from "../settings/updates-panel";
import { AvailableUpdates, type AvailableItem } from "./available-updates";
import { getHelperUpdateStatus } from "@/lib/helpers/updates";
import { prisma } from "@/lib/db";
import { readUpdateSchedule, describeSchedule } from "@/lib/updates/schedule";
import { UpdateScheduleForm } from "./schedule-form";
import { BetaChannels, type BetaItem } from "./beta-channels";
import { AutoUpdatePanel, type AutoItem } from "./auto-update-panel";

export const dynamic = "force-dynamic";

export default async function AdminUpdatesPage() {
  await requirePermission("settings.manage");
  const version = getAppVersion();
  const channel = readChannel();
  const autoInstall = readAutoInstall();
  const failure = readUpdateFailure();

  // Best-effort: an unreachable module source must never take the app's own panel down.
  const moduleStatus = await getModuleUpdateStatus().catch(() => ({
    modules: [],
    errors: [] as { source: string; message: string }[],
    checkedAt: 0,
  }));
  // A new version may add a helper-provided capability; resolve its wording from the
  // installed helpers so the approval prompt names the effect, not the permission key.
  const helperLabels = await helperCapabilityLabels();
  const helperStatus = await getHelperUpdateStatus().catch(() => ({
    helpers: [] as Awaited<ReturnType<typeof getHelperUpdateStatus>>["helpers"],
    errors: [] as { source: string; message: string }[],
    checkedAt: 0,
  }));
  // Opt-in flags live on the rows, not in the update status (which describes what's
  // AVAILABLE, not what you've chosen). Read them here and merge, so one page can answer
  // both "is there an update" and "will it apply itself".
  const schedule = await readUpdateSchedule();

  // Everything with a channel, in one list: the app, each installed module, each helper.
  const moduleRows = await prisma.module.findMany({
    select: { id: true, name: true, channel: true },
    orderBy: { name: "asc" },
  });
  const moduleExcluded = await prisma.module.findMany({
    select: { id: true, name: true, autoUpdateExcluded: true },
    orderBy: { name: "asc" },
  });
  const helperExcluded = new Map(
    (await prisma.helper.findMany({ select: { id: true, autoUpdateExcluded: true } })).map((h) => [
      h.id,
      h.autoUpdateExcluded,
    ]),
  );
  const autoItems: AutoItem[] = [
    { kind: "app", id: "app", name: "JonDash", excluded: !readAutoInstall() },
    ...moduleExcluded.map((m) => ({
      kind: "module" as const,
      id: m.id,
      name: m.name,
      excluded: m.autoUpdateExcluded,
    })),
    ...helperStatus.helpers.map((h) => ({
      kind: "helper" as const,
      id: h.id,
      name: h.name,
      excluded: helperExcluded.get(h.id) ?? false,
      // A helper is dragged along by any module being updated that needs it.
      pulledIn: h.dependents.length > 0,
    })),
  ];

  // One list of everything with an update available, grouped Core / Modules / Helpers.
  const appStatus = await getUpdateStatus().catch(() => null);
  const available: AvailableItem[] = [];
  if (appStatus?.updateAvailable && appStatus.latest) {
    available.push({
      kind: "core",
      id: "app",
      name: "JonDash",
      from: version,
      to: appStatus.latest,
      // Only core declares one today; add-on manifests may gain the field later.
      criticality: appStatus.release?.criticality,
    });
  }
  for (const m of moduleStatus.modules) {
    if (!m.updateAvailable || !m.latestVersion) continue;
    available.push({
      kind: "module",
      id: m.id,
      name: m.name,
      from: m.installedVersion,
      to: m.latestVersion,
      blockedReason: m.blockedReason,
      permissionWarnings: m.permissionsAdded.map((p) => describePermission(p, helperLabels).text),
    });
  }
  for (const h of helperStatus.helpers) {
    if (!h.updateAvailable || !h.latestVersion) continue;
    available.push({
      kind: "helper",
      id: h.id,
      name: h.name,
      from: h.installedVersion,
      to: h.latestVersion,
      blockedReason: h.blockedReason,
      breaksModules: h.breaksModules,
    });
  }

  // How many things automatic updates actually covers, now the master switch decides it.
  const optedInCount = schedule.autoEnabled ? autoItems.filter((i) => !i.excluded).length : 0;

  const betaItems: BetaItem[] = [
    { kind: "app", id: "app", name: "JonDash", onBeta: channel === "beta" },
    ...moduleRows.map((m) => ({
      kind: "module" as const,
      id: m.id,
      name: m.name,
      onBeta: m.channel === "beta",
    })),
    ...helperStatus.helpers.map((h) => ({
      kind: "helper" as const,
      id: h.id,
      name: h.name,
      onBeta: h.channel === "beta",
      derived: !h.pinned,
      note: h.pinned
        ? undefined
        : h.channel === "beta"
          ? `On beta because a module that needs it is.`
          : undefined,
    })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Updates</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Everything that updates — JonDash itself, your modules and the helpers they rely on — is on
          this page, along with when automatic updates run.
        </p>
      </section>

      <section className="card p-6">
        <UpdatesPanel version={version} channel={channel} autoInstall={autoInstall} failure={failure} />
      </section>

      <section className="card p-6">
        <BetaChannels items={betaItems} />
      </section>

      <section className="card p-6">
        <AutoUpdatePanel
          enabled={schedule.autoEnabled}
          items={autoItems}
          scheduleSummary={describeSchedule(schedule)}
        />
      </section>

      <section className="card p-6">
        <UpdateScheduleForm
          frequency={schedule.frequency}
          timeOfDay={`${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`}
          dayOfWeek={schedule.dayOfWeek}
          dayOfMonth={schedule.dayOfMonth}
          optedInCount={optedInCount}
          summary={describeSchedule(schedule)}
        />
      </section>

      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Available updates</h2>
        <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
          Everything with a newer version, in one list. Tick what you want and use{" "}
          <strong>Update selected</strong>, or leave everything unticked and use{" "}
          <strong>Update all</strong>.
        </p>
        <AvailableUpdates items={available} errors={[...moduleStatus.errors, ...helperStatus.errors]} />
        <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>
          Installing and removing modules lives in{" "}
          <Link href="/admin/modules" style={{ color: "var(--primary)" }}>Admin → Modules</Link>.
        </p>
      </section>
    </div>
  );
}
