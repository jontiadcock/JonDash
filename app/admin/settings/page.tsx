import { requirePermission } from "@/lib/auth/guards";
import { listSettings, getLogoFilename } from "@/lib/settings";
import { SettingsForm } from "./ui";
import { LogoForm } from "./logo-form";
import { updateSettingsAction, updateBrandingAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requirePermission("settings.manage");
  const settings = await listSettings("general");
  const branding = await listSettings("branding");
  const logo = await getLogoFilename();

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

      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Branding</h2>
        <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
          Make this instance your own. The name appears in the header and the browser tab; the accent
          colour is used for buttons and highlights, in both light and dark mode. Leave the colour blank
          for the default.
        </p>
        <SettingsForm settings={branding} action={updateBrandingAction} saveLabel="Save branding" />

        <div className="mt-6 border-t pt-6" style={{ borderColor: "var(--border)" }}>
          <h3 className="mb-3 text-sm font-semibold">Logo</h3>
          <LogoForm current={logo} />
        </div>
      </section>
    </div>
  );
}
