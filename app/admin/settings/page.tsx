import { requirePermission } from "@/lib/auth/guards";
import { listSettings, getLogoFilename, getStyleId, listStyleSettings } from "@/lib/settings";
import { STYLE_NAMES } from "@/lib/styles";
import { SettingsForm } from "./ui";
import { LogoForm } from "./logo-form";
import { StyleForm } from "./style-form";
import { updateSettingsAction, updateBrandingAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requirePermission("settings.manage");
  const settings = await listSettings("general");
  const branding = await listSettings("branding");
  const logo = await getLogoFilename();
  const style = await getStyleId();
  const styleSettings = await listStyleSettings(style);
  const styleName = STYLE_NAMES[style] ?? "This style";

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

        <div className="mt-6 border-t pt-6" style={{ borderColor: "var(--border)" }}>
          <h3 className="mb-1 text-sm font-semibold">Interface style</h3>
          <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
            How the interface is drawn. Your accent colour and logo carry across every style. This applies
            to everyone using this instance.
          </p>
          <StyleForm current={style} />

          {/* Options belonging to the CHOSEN style. Modern has an accent colour; XP and
              Crystal carry their own palettes, so they have none — say so rather than
              offering a control that would do nothing. */}
          <div className="mt-5 rounded-xl p-4" style={{ background: "var(--surface-2)" }}>
            <h4 className="mb-1 text-xs font-semibold uppercase" style={{ letterSpacing: "0.08em", color: "var(--muted)" }}>
              {styleName} settings
            </h4>
            {styleSettings.length > 0 ? (
              <>
                <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
                  These apply to the {styleName} style only.
                </p>
                <SettingsForm
                  settings={styleSettings}
                  action={updateBrandingAction}
                  saveLabel={`Save ${styleName} settings`}
                />
              </>
            ) : (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {styleName} has no options of its own — its palette is part of the style. Your logo and
                app name still apply.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
