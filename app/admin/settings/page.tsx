import { requirePermission } from "@/lib/auth/guards";
import { listSettings, getLogoFilename, getStyleId, getPaletteId, listStyleSettings } from "@/lib/settings";
import { STYLE_NAMES, resolvePalette } from "@/lib/styles";
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
  const palette = resolvePalette(style, await getPaletteId()).id;
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

      {/* Branding = WHO this instance is: its name and its logo. */}
      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Branding</h2>
        <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
          Who this instance is. The name appears in the header, the browser tab and new authenticator
          enrolments; the logo replaces the square mark and the browser-tab icon. Both carry across every
          interface style.
        </p>
        <SettingsForm settings={branding} action={updateBrandingAction} saveLabel="Save branding" />

        <div className="mt-6 border-t pt-6" style={{ borderColor: "var(--border)" }}>
          <h3 className="mb-3 text-sm font-semibold">Logo</h3>
          <LogoForm current={logo} />
        </div>
      </section>

      {/* Appearance = HOW it's drawn. Deliberately its own section: a style is chrome, not
          identity, and the two were confusing to see under one heading. */}
      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Appearance</h2>
        <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
          How the interface is drawn. This applies to everyone using this instance — your branding sits on
          top of whichever style you pick.
        </p>
        <div>
          <StyleForm current={style} currentPalette={palette} />

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
