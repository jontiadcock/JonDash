import { requireAdmin } from "@/lib/auth/guards";
import { listSettings } from "@/lib/settings";
import { SettingsForm } from "./ui";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const settings = await listSettings();

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Global configuration for this instance.
        </p>
      </section>

      <section className="card p-6">
        <SettingsForm settings={settings} />
      </section>
    </div>
  );
}
