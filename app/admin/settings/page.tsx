import { requirePermission } from "@/lib/auth/guards";
import { listSettings } from "@/lib/settings";
import { SettingsForm } from "./ui";
import { updateSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requirePermission("settings.manage");
  const settings = await listSettings("general");

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">General</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          General, non-critical configuration for this instance. The update channel lives on the
          Updates page; session lifetime on the Sessions page; audit-log retention on the Audit page.
        </p>
      </section>

      <section className="card p-6">
        <SettingsForm settings={settings} action={updateSettingsAction} />
      </section>
    </div>
  );
}
