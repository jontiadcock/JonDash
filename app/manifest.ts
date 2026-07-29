import type { MetadataRoute } from "next";
import { getAppName } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * The web app manifest — what makes JonDash installable to a phone's home screen (CORE-15).
 *
 * **Readable signed-out, deliberately.** A browser fetches this before deciding to offer "Install",
 * often with no session attached, and a manifest behind auth means the prompt simply never appears.
 * It carries the app's name and its icon, both of which the sign-in page already shows to anyone who
 * can reach it.
 *
 * **`start_url` is `/dashboard`, not `/`.** Launching the installed app should land where the person
 * actually wants to be; if they are not signed in, the normal guard sends them to /login and back
 * again afterwards. That round trip only works because the session cookie is `SameSite=Lax`
 * (BUG-73) — under Strict, launching from the home-screen icon withholds the cookie and the app
 * opens on a login page **every single time**. The two changes ship together for that reason.
 *
 * ⚠ **An install prompt needs a secure context with a certificate the device trusts.** Plain HTTP
 * will not do it (localhost excepted), and **a self-signed certificate does not count** — so the
 * LAN-only installs most likely to want this need their own CA trusted on the phone first. iOS is
 * more forgiving: "Add to Home Screen" works over plain HTTP and honours the Apple touch icon, so
 * the icon lands there regardless; only the standalone-window behaviour is gated.
 *
 * ## Related code
 * | File | Relationship |
 * | --- | --- |
 * | `app/api/branding/icon/route.ts` | Serves every icon referenced here. Its `ALLOWED` size set must contain 192 and 512 or these entries 400. |
 * | `app/layout.tsx` | The iOS half — `appleWebApp` + the Apple touch icon, which iOS uses **instead of** this manifest. |
 * | `lib/auth/session.ts` | `SameSite=Lax` is what makes `start_url` work from a home-screen launch. Revert it and the installed app opens on /login every time (BUG-73). |
 * | `proxy.ts` | Redirects an anonymous request off `/dashboard`, which is why `start_url` needs the cookie to arrive. |
 * | `lib/settings.ts` | `branding.appName` — the `name` and `short_name` here. |
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
