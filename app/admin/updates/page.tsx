import { requirePermission } from "@/lib/auth/guards";
import { getAppVersion } from "@/lib/update";
import { readChannel } from "@/lib/update-channel";
import { UpdatesPanel } from "../settings/updates-panel";

export const dynamic = "force-dynamic";

export default async function AdminUpdatesPage() {
  await requirePermission("settings.manage");
  const version = getAppVersion();
  const channel = readChannel();

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Updates</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Choose your update channel and check for a new version on demand.
        </p>
      </section>

      <section className="card p-6">
        <UpdatesPanel version={version} channel={channel} />
      </section>
    </div>
  );
}
