import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { getModuleState } from "@/lib/modules/registry";
import { buildModuleContext } from "@/lib/modules/context";
import { canViewModule } from "@/lib/modules/visibility";
import { ensureModuleMigrations } from "@/lib/modules/manage";

export const dynamic = "force-dynamic";

/**
 * Catch-all route for module pages, `/m/<id>/…`. ⚠ Every gate below 404s rather than refusing, so
 * a disabled, unknown or restricted module is invisible rather than merely inaccessible.
 *
 * REFS lib/modules/visibility.ts › canViewModule() — the Service-Group check, enforced HERE and
 *      not merely hidden from the dashboard · lib/modules/context.ts › buildModuleContext()
 *      lib/modules/registry.ts › getModuleState() · lib/modules/manage.ts
 */
export default async function ModulePageRoute({
  params,
}: {
  params: Promise<{ module: string; path?: string[] }>;
}) {
  const user = await requireUser();
  const { module: moduleId, path } = await params;

  await ensureModuleMigrations(); // a new version may have shipped new tables
  const state = await getModuleState(moduleId);
  if (!state || !state.enabled || !state.def.Page) notFound();
  if (state.def.adminOnly && user.role !== "ADMIN") notFound();
  // ⚠ The page is where Service-Group RBAC is ENFORCED. The dashboard filtering only hides a
  // restricted module; without this line the URL still serves it.
  if (!(await canViewModule(moduleId, { id: user.id, role: user.role }))) notFound();

  const ctx = buildModuleContext(state.def, state.granted, {
    id: user.id,
    email: user.email,
    role: user.role,
  });
  const Page = state.def.Page;
  return <Page ctx={ctx} path={path ?? []} />;
}
