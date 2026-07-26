import { redirect } from "next/navigation";

/**
 * Helpers moved into Admin → Addons (CORE-10), as its "Shared capabilities" section.
 *
 * A redirect rather than a deletion: this path is linked from older docs and may be bookmarked,
 * and a 404 tells somebody the feature is gone rather than moved.
 */
export default function AdminHelpersPage() {
  redirect("/admin/modules");
}
