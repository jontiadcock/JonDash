import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { getModuleState } from "@/lib/modules/registry";
import { moduleSettingsApi } from "@/lib/modules/store";
import { prisma } from "@/lib/db";
import { moduleGroupIds } from "@/lib/modules/visibility";
import { buildModuleContext } from "@/lib/modules/context";

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
        {/* NO STATE HERE, deliberately (BUG-34). Once the controls moved to Admin → Updates
            these became read-only mirrors: they couldn't be acted on but could still go
            stale, and did — this page read "Currently on beta" while the Updates toggle for
            the same module was off. A mirror that can't be used but can be wrong is worse
            than no mirror. A pointer with no state in it cannot ever disagree. */}
        <h2 className="mb-1 text-lg font-semibold">Updates</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Release channel and automatic updates for this module are managed on{" "}
          <Link href="/admin/updates" style={{ color: "var(--primary)" }}>Admin → Updates</Link>.
        </p>
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
