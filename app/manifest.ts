import type { MetadataRoute } from "next";
import { getAppName } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * The web app manifest — what makes JonDash installable to a phone's home screen (CORE-15).
 *
 * ⚠ Readable SIGNED-OUT: a browser fetches this before offering "Install", usually with no session,
 * so a manifest behind auth means the prompt never appears. It carries only the name and icon, both
 * already on the sign-in page.
 * ⚠ `start_url` is `/dashboard`, and that only works because the session cookie is `SameSite=Lax`
 * (BUG-73). Under Strict, launching from the home-screen icon withholds the cookie and the app
 * opens on /login every single time.
 * ⚠ An install prompt needs a secure context with a certificate the DEVICE trusts — a self-signed
 * one does not count, so a LAN-only install needs its CA on the phone first. iOS is more forgiving.
 *
 * REFS app/api/branding/icon/route.ts — its `ALLOWED` set must contain 192 and 512 or these 400
 *      app/layout.tsx — the iOS half, which iOS uses INSTEAD of this · lib/auth/session.ts
 *      proxy.ts — redirects an anonymous request off `/dashboard` · lib/settings.ts
 * PINS tests/unit/pwa-metadata.test.ts
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const name = await getAppName().catch(() => "");
  const appName = name || "JonDash";

  const icon = (size: number, maskable = false) => ({
    src: `/api/branding/icon?size=${size}${maskable ? "&maskable=1" : ""}`,
    sizes: `${size}x${size}`,
    type: "image/png",
    purpose: (maskable ? "maskable" : "any") as "maskable" | "any",
  });

  return {
    name: appName,
    // Home screens truncate at about a dozen characters, so a long custom name gets its own short
    // form rather than being cut mid-word by the launcher.
    short_name: appName.length > 12 ? appName.slice(0, 12).trim() : appName,
    description: "Your personal dashboard of services.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0b0d12",
    theme_color: "#4f46e5",
    orientation: "any",
    icons: [icon(192), icon(512), icon(192, true), icon(512, true)],
  };
}
