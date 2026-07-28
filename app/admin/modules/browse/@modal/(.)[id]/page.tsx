import { requirePermission } from "@/lib/auth/guards";
import type { ModuleChannel } from "@/lib/modules/sources";
import { ModuleOverlay } from "../../module-overlay";
import { ModuleDetail, loadModule } from "../../module-detail";

export const dynamic = "force-dynamic";

/**
 * A module opened from the catalogue — the same content as its page, expanded over the grid.
 *
 * **`(.)` intercepts `/admin/modules/browse/[id]`.** A slot is not a route segment, so from inside
 * `@modal` the marker sits at `browse` level and `(.)` matches its children — which is what makes
 * one URL render two ways: clicked from the catalogue it opens here, over the grid; pasted, shared
 * or reloaded it renders the full page. Both are correct answers to the same address, and neither
 * duplicates the other's content — `ModuleDetail` is the one consent screen.
 *
 * A module missing from the manifest says so here rather than calling `notFound()`. The page can
 * 404 because it *is* the page; a 404 rendered into a slot would put an error where an overlay is
 * supposed to be while the catalogue sits behind it, saying nothing about how to get out.
 */
export default async function ModuleOverlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ channel?: string }>;
}) {
  await requirePermission("modules.manage");
  const { id } = await params;
  const { channel: raw } = await searchParams;
  const channel: ModuleChannel = raw === "beta" ? "beta" : "stable";
  const m = await loadModule(id, channel);

  return (
    <ModuleOverlay>
      {m ? (
        <ModuleDetail m={m} channel={channel} />
      ) : (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          That module is no longer published on the {channel} channel by your sources.
        </p>
      )}
    </ModuleOverlay>
  );
}
