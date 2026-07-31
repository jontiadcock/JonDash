import { requirePermission } from "@/lib/auth/guards";
import { modulePermissions, capabilityHolders } from "@/lib/permissions-view";
import { PermissionsView } from "./ui";

export const dynamic = "force-dynamic";

/**
 * Admin → Permissions (CORE-10).
 *
 * One screen answering both questions an admin actually asks: *what can this module do*, and
 * *what can reach my files*. The second cannot be reconstructed by clicking through modules one
 * at a time, which is why it is a page rather than a section on each module.
 *
 * Grants are per (module, capability). A helper-level switch would silently widen every module
 * that declared that helper — including ones installed earlier for unrelated reasons.
 * REFS lib/auth/guards.ts · lib/permissions-view.ts
 */
export default async function AdminPermissionsPage() {
  await requirePermission("modules.manage");

  const [modules, capabilities] = await Promise.all([modulePermissions(), capabilityHolders()]);

  return (
    <div className="flex flex-col gap-6">
      <section>
        {/* Must match the nav label in app/admin/layout.tsx — the nav and the heading are two
            separate declarations of the same name, and nothing catches them disagreeing. */}
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Addon Permissions</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          What each module is allowed to do, and what it&apos;s limited to. Turning something off takes
          effect immediately — the module keeps working, but that capability stops answering.
        </p>
      </section>

      <PermissionsView
        modules={modules.map((m) => ({
          moduleId: m.moduleId,
          moduleName: m.moduleName,
          enabled: m.enabled,
          declared: m.declared.map((c) => ({ ...c, permission: String(c.permission) })),
          // A Set can't cross into a client component; the array is the same information.
          granted: [...m.granted].map(String),
        }))}
        capabilities={capabilities.map((c) => ({
          capability: { ...c.capability, permission: String(c.capability.permission) },
          holders: c.holders,
        }))}
      />
    </div>
  );
}
