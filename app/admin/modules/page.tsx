import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { listModulesForAdmin } from "@/lib/modules/registry";
import { pruneRemovedBundledModules, ensureModuleMigrations } from "@/lib/modules/manage";
import { readFailedModule } from "@/lib/modules/rebuild";
import { PERMISSION_WARNINGS, DANGEROUS_PERMISSIONS } from "@/lib/modules/types";
import { ModulesList, type ModuleItem } from "./ui";
import { ImportModuleForm } from "./import-form";
import { FailedModuleNotice } from "./failed-notice";

export const dynamic = "force-dynamic";

export default async function AdminModulesPage() {
  await requirePermission("modules.manage");
  await ensureModuleMigrations(); // apply migrations gained in an update
  await pruneRemovedBundledModules(); // drop leftovers from a module a past build shipped
  const states = await listModulesForAdmin();
  const failed = readFailedModule(); // a module the launcher had to remove to boot

  const items: ModuleItem[] = states.map(({ def, enabled, installed }) => ({
    id: def.id,
    name: def.name,
    description: def.description,
    version: def.version,
    icon: def.icon ? <def.icon className="h-5 w-5" /> : null,
    enabled,
    installed,
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
      {failed && <FailedModuleNotice moduleId={failed.id} at={failed.at} />}

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin/modules/browse" className="btn btn-ghost !py-1.5 text-sm">Browse modules</Link>
        <Link href="/admin/modules/sources" className="btn btn-ghost !py-1.5 text-sm">Manage sources</Link>
      </div>

      <h2 className="text-lg font-semibold tracking-tight">Installed</h2>
      <ModulesList items={items} />

      <ImportModuleForm />
    </div>
  );
}
