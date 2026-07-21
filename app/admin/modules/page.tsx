import { requirePermission } from "@/lib/auth/guards";
import { listModulesForAdmin } from "@/lib/modules/registry";
import { PERMISSION_WARNINGS, DANGEROUS_PERMISSIONS } from "@/lib/modules/types";
import { ModulesList, type ModuleItem } from "./ui";

export const dynamic = "force-dynamic";

export default async function AdminModulesPage() {
  await requirePermission("modules.manage");
  const states = await listModulesForAdmin();

  const items: ModuleItem[] = states.map(({ def, enabled }) => ({
    id: def.id,
    name: def.name,
    description: def.description,
    version: def.version,
    enabled,
    hasSettings: (def.settings?.length ?? 0) > 0,
    hasPage: !!def.Page,
    permissions: def.permissions.map((p) => ({
      key: p,
      warning: PERMISSION_WARNINGS[p],
      dangerous: DANGEROUS_PERMISSIONS.has(p),
    })),
  }));

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Modules</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Optional add-ons that plug into JonDash. Enabling one only affects that module; disabling or
          uninstalling it leaves the base app unchanged. Review the permissions a module requests before
          you enable it.
        </p>
      </section>
      <ModulesList items={items} />
    </div>
  );
}
