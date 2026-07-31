import { NextResponse } from "next/server";
import { getLogoFilename } from "@/lib/settings";
import { readIcon } from "@/lib/icons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves the instance's uploaded logo (CORE-06).
 *
 * **Takes no parameters, deliberately.** It serves only whatever `branding.logo` currently
 * points at, so — unlike a route that accepts a filename — it can't be pointed at any other
 * upload, and there's nothing to enumerate or traverse. `readIcon` re-validates the stored
 * name anyway.
 *
 * **Unauthenticated, also deliberately.** The logo is the one piece of branding that has to
 * render on the sign-in page, before anyone is signed in — that's precisely where a
 * white-labelled instance should look like itself. It reveals only that this install has a
 * custom logo, which is visible to anyone who can reach the sign-in page regardless. Service
 * icons stay behind auth (`/api/icons/[id]`), because those would disclose what a user runs.
 * REFS lib/settings.ts · lib/icons.ts
 */
export async function GET() {
  // Read past the cache: this route is a separate bundle from the upload action, so it holds
  // its own copy of the settings cache and never sees that action's invalidation.
  const filename = await getLogoFilename(true).catch(() => "");
  if (!filename) return new NextResponse("Not found", { status: 404 });

  const data = await readIcon(filename);
  if (!data) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": "inline",
      // Named per upload (the filename is random), so it can be cached hard; changing the
      // logo changes the name and busts it.
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
