import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { getModuleState } from "@/lib/modules/registry";
import { moduleSettingsApi } from "@/lib/modules/store";
import { ModuleSettingsForm, type SettingFieldView } from "./ui";

export const dynamic = "force-dynamic";

export default async function ModuleSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("modules.manage");
  const { id } = await params;
  const state = await getModuleState(id);
  if (!state) notFound();
  const { def, enabled } = state;

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
        {fields.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>This module has no settings.</p>
        ) : (
          <ModuleSettingsForm moduleId={def.id} fields={fields} />
        )}
      </section>
    </div>
  );
}
