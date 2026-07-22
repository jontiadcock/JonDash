import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { getAppVersion } from "@/lib/update";
import { readChannel } from "@/lib/update-channel";
import { readAutoInstall, readUpdateFailure } from "@/lib/update-prefs";
import { getModuleUpdateStatus } from "@/lib/modules/updates";
import { PERMISSION_WARNINGS } from "@/lib/modules/types";
import { UpdatesPanel } from "../settings/updates-panel";
import { ModuleUpdatesPanel, type ModuleUpdateView } from "./module-updates-panel";

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
    permissionWarningsAdded: m.permissionsAdded.map((p) => PERMISSION_WARNINGS[p]).filter(Boolean),
    permissionsRemovedCount: m.permissionsRemoved.length,
    notes: m.notes,
  }));

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Updates</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Choose your update channel and check for a new version on demand. Module updates are managed
          separately below.
        </p>
      </section>

      <section className="card p-6">
        <UpdatesPanel version={version} channel={channel} autoInstall={autoInstall} failure={failure} />
      </section>

      <section className="card p-6">
        <ModuleUpdatesPanel modules={moduleViews} errors={moduleStatus.errors} />
        <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>
          Installing and removing modules lives in{" "}
          <Link href="/admin/modules" style={{ color: "var(--primary)" }}>Admin → Modules</Link>.
        </p>
      </section>
    </div>
  );
}
