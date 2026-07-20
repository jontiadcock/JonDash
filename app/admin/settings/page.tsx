import { requirePermission } from "@/lib/auth/guards";
import { listSettings } from "@/lib/settings";
import { getAppVersion } from "@/lib/update";
import { readChannel } from "@/lib/update-channel";
import { SettingsForm } from "./ui";
import { UpdatesPanel } from "./updates-panel";
import { updateSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requirePermission("settings.manage");
  const settings = await listSettings("general");
  const version = getAppVersion();
  const channel = readChannel();

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          General, non-critical configuration for this instance. Session lifetime lives on the
          Sessions page, and audit-log retention on the Audit page.
        </p>
      </section>

      <section className="card p-6">
        <SettingsForm settings={settings} action={updateSettingsAction} />
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">Updates</h2>
        <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
          Choose your update channel and check for a new version on demand.
        </p>
        <div className="card p-6">
          <UpdatesPanel version={version} channel={channel} />
        </div>
      </section>
    </div>
  );
}
