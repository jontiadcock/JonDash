import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import type { ModuleChannel } from "@/lib/modules/sources";
import { ModuleDetail, loadModule } from "../module-detail";

export const dynamic = "force-dynamic";

/**
 * One module's page (design B1) — a single reading column, opened from a card in the catalogue.
 *
 * **This is where consent happens, and it is the reason the page exists.** The catalogue shows a
 * chip saying roughly how much access a module wants; the full list of what it can actually do
 * lives here, and so do the install actions. Neither queueing nor installing is possible without
 * passing through this content, which is the property the previous design lacked — a checkbox on
 * every row let a module be installed without its permissions ever having been on screen.
 *
 * **The screen itself is `ModuleDetail`, shared with the overlay.** Clicking a card in the
 * catalogue expands the same module over the grid; this page is what a pasted link or a reload
 * gives you. Two hand-written copies of a consent screen is how one of them quietly ends up
 * listing fewer permissions than the other, so there is one.
 *
 * **Back returns you to the page of the catalogue you left** (8.4), which is why `channel` and
 * `page` are carried in the query string rather than held in component state: a full navigation
 * would lose state, and coming back to page 1 after browsing to page 4 is its own small betrayal.
 *
 * **No screenshots yet.** They are a manifest contract the add-ons repo has agreed but not built
 * (`screenshots: [{file, caption}]`, resolved by core against the pinned tag). The section is
 * absent rather than an empty placeholder until modules actually publish them.
 */
export default async function ModuleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ channel?: string; page?: string }>;
}) {
  await requirePermission("modules.manage");
  const { id } = await params;
  const { channel: rawChannel, page } = await searchParams;
  const channel: ModuleChannel = rawChannel === "beta" ? "beta" : "stable";

  const m = await loadModule(id, channel);
  // A module that is not in this channel's manifest genuinely is not here — an id in the URL is
  // not evidence it exists, and inventing a page for one would be worse than saying so.
  if (!m) notFound();

  const backHref = `/admin/modules/browse?channel=${channel}${page ? `&page=${encodeURIComponent(page)}` : ""}`;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href={backHref} className="text-sm" style={{ color: "var(--muted)" }}>
        ← Browse modules
      </Link>

      <ModuleDetail m={m} channel={channel} />
    </div>
  );
}
