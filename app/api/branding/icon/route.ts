import sharp from "sharp";
import { getLogoFilename, getAppName } from "@/lib/settings";
import { readIcon } from "@/lib/icons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The sizes anything asks for: 32 favicon, 180 Apple touch, 192 + 512 web app manifest. */
const ALLOWED = new Set([32, 96, 180, 192, 512]);

/**
 * This install's icon at a requested size (CORE-15) — ONE source for the browser tab, the iOS home
 * screen, the Android launcher and the web app manifest. With a logo it serves the resized upload;
 * without one it draws the same lettered mark the header does, so an unbranded install looks like
 * itself everywhere instead of falling back to a stock favicon.
 *
 * ⚠ Unauthenticated on purpose, like the logo route beside it: a favicon and a home-screen icon are
 * fetched with no session, and a manifest behind auth means the install prompt never appears.
 * ⚠ The lettered mark is DUPLICATED in JSX — change the letter, colour or corner radius in both or
 * the tab icon stops matching the header. This is the duplication to watch in this feature.
 *
 * REFS app/components/branding.tsx › BrandMark() · BrandHeading() — the JSX copy
 *      app/manifest.ts — the 192/512 and maskable entries · app/layout.tsx — tab + Apple touch
 *      lib/icons.ts › readIcon() · lib/settings.ts — `branding.logo` and `branding.appName`
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const size = Number(url.searchParams.get("size") ?? "192");
  if (!ALLOWED.has(size)) return new Response("Bad size", { status: 400 });

  /*
   * ⚠ `maskable` MUST pad the artwork into the middle 80%. Android crops a launcher icon to
   * whatever shape the device uses and cuts off the outer fifth, so declaring an icon maskable
   * without that margin beheads the logo on someone's home screen.
   * REFS app/manifest.ts — where it is declared maskable
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
