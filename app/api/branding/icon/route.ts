import sharp from "sharp";
import { getLogoFilename, getAppName } from "@/lib/settings";
import { readIcon } from "@/lib/icons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The sizes anything asks for: 32 favicon, 180 Apple touch, 192 + 512 web app manifest. */
const ALLOWED = new Set([32, 96, 180, 192, 512]);

/**
 * This install's icon, at a requested size (CORE-15).
 *
 * **One source for every icon surface** — the browser tab, the iOS home screen, the Android
 * launcher and the web app manifest all come through here. Before this, the tab fell back to a
 * bundled `favicon.ico` that had been the stock create-next-app file since the first commit, so an
 * install without an uploaded logo showed **Vercel's triangle** while every other surface showed a
 * lettered mark. One route means they can never disagree again.
 *
 * **With a logo:** the uploaded image, resized. **Without one:** the same lettered mark the header
 * and sign-in page already draw — first letter of the app name on the palette's primary — rendered
 * as an SVG and rasterised. An unbranded install then looks like itself everywhere.
 *
 * **Unauthenticated, like the logo route it sits beside.** A home-screen icon and a favicon are
 * fetched by the browser with no session in contexts we do not control, and the manifest that
 * references them must be readable signed-out or the install prompt never appears. It reveals the
 * app's name and logo, both of which the sign-in page already shows to anyone who can reach it.
 *
 * ## Related code — keep these in step
 * | File | Relationship |
 * | --- | --- |
 * | `app/components/branding.tsx` | **Draws the same lettered mark in JSX** (`BrandMark`, `BrandHeading`). Change the letter, the colour or the corner radius here and it must change there, or the tab icon and the header stop matching. **This is the duplication to watch in this feature.** |
 * | `app/api/branding/logo/route.ts` | Serves the raw uploaded logo at its original size. This route resizes the same file; both read `branding.logo` through `getLogoFilename`. |
 * | `app/manifest.ts` | Consumes this route for the 192/512 and maskable icons. |
 * | `app/layout.tsx` | Consumes it for the tab icon and the Apple touch icon. |
 * | `lib/settings.ts` | Owns `branding.logo` and `branding.appName`, the two inputs. |
 * | `lib/icons.ts` | `readIcon` — the validated read of an uploaded file. |
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const size = Number(url.searchParams.get("size") ?? "192");
  if (!ALLOWED.has(size)) return new Response("Bad size", { status: 400 });

  /*
   * `maskable` pads the artwork into the middle 80% of the canvas.
   *
   * Android crops a launcher icon to whatever shape the device uses — circle, squircle, rounded
   * square — and anything in the outer fifth is simply cut off. Declaring an icon maskable without
   * leaving that margin is how a logo ends up beheaded on someone's home screen.
   */
  const maskable = url.searchParams.get("maskable") === "1";

  let png: Buffer;
  try {
    png = await renderIcon(size, maskable);
  } catch {
    return new Response("Icon unavailable", { status: 500 });
  }

  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      "content-type": "image/png",
      // Short, because the logo and the app name are both editable and this must follow them
      // without an admin wondering why their new logo has not appeared.
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}

async function renderIcon(size: number, maskable: boolean): Promise<Buffer> {
  const inner = maskable ? Math.round(size * 0.8) : size;
  const pad = Math.round((size - inner) / 2);

  const filename = await getLogoFilename(true).catch(() => "");
  const uploaded = filename ? await readIcon(filename).catch(() => null) : null;

  if (uploaded) {
    const art = await sharp(uploaded)
      .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    if (!maskable) return art;
    return sharp({
      create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: art, top: pad, left: pad }])
      .png()
      .toBuffer();
  }

  // No logo: the lettered mark, matching what BrandMark and BrandHeading draw.
  const name = (await getAppName().catch(() => "")) || "JonDash";
  const letter = escapeXml(name.trim().charAt(0).toUpperCase() || "J");
  const radius = Math.round(inner * 0.22);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${radius}" fill="#4f46e5"/>
  <text x="${size / 2}" y="${size / 2}" fill="#ffffff" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif"
        font-size="${Math.round(inner * 0.56)}" font-weight="700" text-anchor="middle" dominant-baseline="central">${letter}</text>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** The app name is admin-set text going into an SVG document — escape it rather than trust it. */
function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === '"' ? "&quot;" : "&apos;",
  );
}
