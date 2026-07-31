import { redirect } from "next/navigation";

/**
 * Helpers moved into Admin → Addons (CORE-10), as its "Shared capabilities" section.
 *
 * ⚠ A redirect, not a deletion: the path is linked from older docs and may be bookmarked, and a
 * 404 says the feature is gone rather than moved.
 * REFS app/admin/modules/page.tsx — the destination · app/admin/modules/shared-capabilities.tsx
 * PINS tests/unit/helper-settings.test.ts — asserts against the panel, not this route
 */
export default function AdminHelpersPage() {
  redirect("/admin/modules");
}
