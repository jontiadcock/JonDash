import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { getModuleState } from "@/lib/modules/registry";
import { buildModuleContext } from "@/lib/modules/context";
import { canViewModule } from "@/lib/modules/visibility";

export const dynamic = "force-dynamic";

/**
 * Catch-all route for module pages: /m/<id>/... A module renders here only when it's
 * enabled and (if adminOnly) the viewer is an admin; otherwise 404 — so a disabled or
 * unknown module is invisible and the base app is unaffected.
 */
export default async function ModulePageRoute({
  params,
}: {
  params: Promise<{ module: string; path?: string[] }>;
}) {
  const user = await requireUser();
  const { module: moduleId, path } = await params;

  const state = await getModuleState(moduleId);
  if (!state || !state.enabled || !state.def.Page) notFound();
  if (state.def.adminOnly && user.role !== "ADMIN") notFound();
  // Service-Group RBAC: a restricted module 404s for anyone outside its groups, so the
  // page is enforced here and not merely hidden from the dashboard.
  if (!(await canViewModule(moduleId, { id: user.id, role: user.role }))) notFound();

  const ctx = buildModuleContext(state.def, state.granted, {
    id: user.id,
    email: user.email,
    role: user.role,
  });
  const Page = state.def.Page;
  return <Page ctx={ctx} path={path ?? []} />;
}
