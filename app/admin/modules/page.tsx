import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { listModulesForAdmin } from "@/lib/modules/registry";
import { pruneRemovedBundledModules, ensureModuleMigrations } from "@/lib/modules/manage";
import { readFailedModule } from "@/lib/modules/rebuild";
import { reconcileHelpers } from "@/lib/helpers/reconcile";
import { describePermission } from "@/lib/modules/types";
import { helperCapabilityLabels } from "@/lib/helpers/registry";
import { ModulesList, type ModuleItem } from "./ui";
import { ImportModuleForm } from "./import-form";
import { FailedModuleNotice } from "./failed-notice";
import { HelperGapNotice } from "./helper-gap-notice";
import { SharedCapabilities } from "./shared-capabilities";

export const dynamic = "force-dynamic";

export default async function AdminModulesPage() {
  await requirePermission("modules.manage");
  await ensureModuleMigrations(); // apply migrations gained in an update
  await pruneRemovedBundledModules(); // drop leftovers from a module a past build shipped
  const states = await listModulesForAdmin();
  // A module declaring a helper it doesn't have is silently inert. First-party modules
  // heal themselves here (files only — activation needs a restart the admin triggers);
  // third-party and imported ones are reported and left alone.
  const helperGaps = await reconcileHelpers().catch(() => []);
  const failed = readFailedModule(); // a module the launcher had to remove to boot
  // Wording for capabilities the installed HELPERS provide, so a module that gets its
  // privilege by proxy still says so on screen.
  const helperLabels = await helperCapabilityLabels();

  const items: ModuleItem[] = states.map(({ def, enabled, installed }) => ({
    id: def.id,
    name: def.name,
    description: def.description,
    version: def.version,
    icon: def.icon ? <def.icon className="h-5 w-5" /> : null,
    enabled,
    installed,
    // A module configures itself EITHER with a declared `settings` array OR with its own
    // `SettingsPanel` — the two are alternatives (see ModuleDefinition). Counting only the
    // array meant a panel-only module (backup-manager on stable) looked settings-less and its
    // button read "Channel", leaving an admin no obvious route to its settings.
    // Reported by the add-ons session 2026-07-25, confirmed against host-vitals 0.0.1 vs 0.0.2.
    hasSettings: (def.settings?.length ?? 0) > 0 || !!def.SettingsPanel,
    hasPage: !!def.Page,
    permissions: def.permissions.map((p) => {
      const { text, dangerous } = describePermission(p, helperLabels);
      return { key: p, warning: text, dangerous };
    }),
  }));

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Addons</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Optional extras that plug into JonDash. Enabling one only affects that addon; disabling or
          uninstalling it leaves the base app unchanged. Review the permissions an addon requests before
          you enable it — and see{" "}
          <Link href="/admin/permissions" style={{ color: "var(--primary)" }}>Addon Permissions</Link> for what
          everything currently holds.
        </p>
      </section>
      {failed && <FailedModuleNotice moduleId={failed.id} at={failed.at} />}
      <HelperGapNotice gaps={helperGaps} />

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin/modules/browse" className="btn btn-ghost !py-1.5 text-sm">Browse modules</Link>
        <Link href="/admin/modules/sources" className="btn btn-ghost !py-1.5 text-sm">Manage sources</Link>
      </div>

      <h2 className="text-lg font-semibold tracking-tight">Installed</h2>
      <ModulesList items={items} />

      <ImportModuleForm />

      {/* Shared capabilities — the same page, a SEPARATE list, never mixed in with the modules
          above. They cannot be installed or removed by hand: one arrives with a module that
          needs it and goes when nothing does. Listing them as peers would imply a control that
          does not exist, which is why this is its own section rather than more rows. */}
      <SharedCapabilities />
    </div>
  );
}
