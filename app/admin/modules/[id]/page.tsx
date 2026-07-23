import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { getModuleState } from "@/lib/modules/registry";
import { moduleSettingsApi } from "@/lib/modules/store";
import { prisma } from "@/lib/db";
import { moduleGroupIds } from "@/lib/modules/visibility";
import { buildModuleContext } from "@/lib/modules/context";
import { setModuleChannelAction } from "../actions";
import { ModuleSettingsForm, type SettingFieldView } from "./ui";
import { ModuleGroupsForm } from "./groups-form";

export const dynamic = "force-dynamic";

export default async function ModuleSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requirePermission("modules.manage");
  const { id } = await params;
  const state = await getModuleState(id);
  if (!state) notFound();
  const { def, enabled } = state;

  const groups = await prisma.serviceRole.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const selectedGroupIds = await moduleGroupIds(def.id);

  // A module may supply its own settings UI. Only render it once the module is enabled —
  // before that no permissions have been granted, so anything it tried to read would be
  // missing from the context and it would render against a half-set-up module.
  const SettingsPanel = enabled ? def.SettingsPanel : undefined;
  const panelCtx = SettingsPanel
    ? buildModuleContext(def, state.granted, { id: viewer.id, email: viewer.email, role: viewer.role })
    : null;

  const values = await moduleSettingsApi(def).all();
  const fields: SettingFieldView[] = (def.settings ?? []).map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    help: f.help ?? null,
    secret: !!f.secret,
    value: f.secret ? null : (values[f.key] ?? null), // never send secrets to the client
    hasValue: values[f.key] != null && values[f.key] !== "",
  }));

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Link href="/admin/modules" className="text-sm" style={{ color: "var(--muted)" }}>
          ← Modules
        </Link>
        <h1 className="mb-1 mt-1 text-2xl font-semibold tracking-tight">{def.name} settings</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>{def.description}</p>
      </section>

      {!enabled && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          This module is disabled — its settings won&apos;t take effect until you enable it.
        </p>
      )}

      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Who can see this module</h2>
        <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
          {def.adminOnly ? (
            <>
              This module declares itself <strong>admin-only</strong>, so it is never shown to non-admins
              whatever you choose here.
            </>
          ) : (
            <>
              Limit it to Service Groups, exactly like a service tile. <strong>Leave all unticked</strong> and
              every signed-in user sees it; tick one or more and only their members do. Full admins always see
              it.
            </>
          )}
        </p>
        <ModuleGroupsForm moduleId={def.id} groups={groups} selected={selectedGroupIds} />
      </section>

      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Release channel</h2>
        <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
          Which releases <strong>this module</strong> updates to. This is separate from JonDash&apos;s own
          update channel — you can run one module on beta while everything else stays on stable.
        </p>
        <form action={setModuleChannelAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={def.id} />
          <input type="hidden" name="channel" value={state.channel === "beta" ? "stable" : "beta"} />
          <span className="text-sm">
            Currently on <strong>{state.channel}</strong>
            {state.channel === "beta" && " — you'll get pre-release versions of this module."}
          </span>
          <button type="submit" className="btn btn-ghost !py-1.5 text-sm" disabled={!state.installed}>
            {state.channel === "beta" ? "Leave beta (use stable)" : "Opt into beta releases"}
          </button>
        </form>
        {!state.installed && (
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            Enable the module first — the channel applies to its updates.
          </p>
        )}

        {/* The toggle itself moved to Admin → Updates, where the schedule and every other
            update control now live. Keeping a second copy here would mean two places to
            look and two to keep in step. */}
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <h3 className="mb-1 font-medium">Automatic updates</h3>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Currently <strong>{state.autoUpdate ? "on" : "off"}</strong> for this module. Change it — and
            set when automatic updates run — on{" "}
            <Link href="/admin/updates" style={{ color: "var(--primary)" }}>Admin → Updates</Link>, which
            now holds everything that updates.
          </p>
        </div>
      </section>

      {(fields.length > 0 || !SettingsPanel) && (
        <section className="card p-6">
          {fields.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>This module has no settings.</p>
          ) : (
            <ModuleSettingsForm moduleId={def.id} fields={fields} />
          )}
        </section>
      )}

      {/* A module's own settings UI, rendered BELOW the auto-generated fields so it can
          have both: simple declared settings plus richer controls of its own. It gets a
          context scoped to the permissions the admin granted, exactly like its widget
          and page — never an unscoped one just because this is an admin screen. */}
      {SettingsPanel && (
        <section className="card p-6">
          <SettingsPanel ctx={panelCtx!} />
        </section>
      )}
    </div>
  );
}
