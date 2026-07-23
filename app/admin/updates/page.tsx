import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { getAppVersion } from "@/lib/update";
import { readChannel } from "@/lib/update-channel";
import { readAutoInstall, readUpdateFailure } from "@/lib/update-prefs";
import { getModuleUpdateStatus } from "@/lib/modules/updates";
import { describePermission } from "@/lib/modules/types";
import { helperCapabilityLabels } from "@/lib/helpers/registry";
import { UpdatesPanel } from "../settings/updates-panel";
import { ModuleUpdatesPanel, type ModuleUpdateView } from "./module-updates-panel";
import { HelperUpdatesPanel, type HelperUpdateView } from "./helper-updates-panel";
import { getHelperUpdateStatus } from "@/lib/helpers/updates";
import { prisma } from "@/lib/db";
import { readUpdateSchedule, describeSchedule } from "@/lib/updates/schedule";
import { UpdateScheduleForm } from "./schedule-form";
import { BetaChannels, type BetaItem } from "./beta-channels";

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
  const [moduleFlags, helperFlags, schedule] = await Promise.all([
    prisma.module.findMany({ select: { id: true, autoUpdate: true } }),
    prisma.helper.findMany({ select: { id: true, autoUpdate: true } }),
    readUpdateSchedule(),
  ]);
  const moduleAuto = new Map(moduleFlags.map((m) => [m.id, m.autoUpdate]));
  const helperAuto = new Map(helperFlags.map((h) => [h.id, h.autoUpdate]));
  const optedInCount =
    moduleFlags.filter((m) => m.autoUpdate).length + helperFlags.filter((h) => h.autoUpdate).length;

  const helperViews: HelperUpdateView[] = helperStatus.helpers.map((h) => ({
    ...h,
    autoUpdate: helperAuto.get(h.id) ?? false,
  }));

  // Everything with a channel, in one list: the app, each installed module, each helper.
  const moduleRows = await prisma.module.findMany({
    select: { id: true, name: true, channel: true },
    orderBy: { name: "asc" },
  });
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

  // Drives the "Update everything" button: only offer it when there is actually something
  // for it to do, across BOTH add-on kinds.
  const anythingToUpdate =
    moduleStatus.modules.some((m) => m.updateAvailable && !m.blockedReason && !m.isDowngrade) ||
    helperStatus.helpers.some((h) => h.updateAvailable && !h.blockedReason && !h.isDowngrade);

  const moduleViews: ModuleUpdateView[] = moduleStatus.modules.map((m) => ({
    id: m.id,
    name: m.name,
    installedVersion: m.installedVersion,
    latestVersion: m.latestVersion,
    channel: m.channel,
    sourceName: m.sourceName,
    updateAvailable: m.updateAvailable,
    blockedReason: m.blockedReason,
    isDowngrade: m.isDowngrade,
    // Resolved to plain language here, so the admin approves a described capability
    // rather than a permission key.
    permissionWarningsAdded: m.permissionsAdded.map((p) => describePermission(p, helperLabels).text),
    permissionsRemovedCount: m.permissionsRemoved.length,
    notes: m.notes,
    autoUpdate: moduleAuto.get(m.id) ?? false,
  }));

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
        <ModuleUpdatesPanel modules={moduleViews} errors={moduleStatus.errors} />
        <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>
          Installing and removing modules lives in{" "}
          <Link href="/admin/modules" style={{ color: "var(--primary)" }}>Admin → Modules</Link>.
        </p>
      </section>

      <section className="card p-6">
        <HelperUpdatesPanel
          helpers={helperViews}
          errors={helperStatus.errors}
          anythingToUpdate={anythingToUpdate}
        />
      </section>
    </div>
  );
}
