import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { getAccentColor, getAppName, getLogoFilename, getStyleId, getPaletteId, STYLE_SETTINGS } from "@/lib/settings";
import { resolvePalette, resolveStylePair } from "@/lib/styles";

/**
 * ⚠ Every export here must check this before reading settings. JonDash builds on each machine,
 * often before `prisma migrate` has run; the catch below would cope, but Prisma logs
 * `prisma:error` first and every build printed alarming errors for a healthy install.
 */
const isBuildPhase = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;

/*
 * Rebranding (CORE-06) runtime. ⚠ Every function here is best-effort — a settings read that fails
 * must return the stock look rather than take the page down.
 */

/** The accent's readable foreground. Relative luminance → black or white. */
function contrastOn(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? "#16181d" : "#ffffff";
}

/**
 * Instance accent colour as a `:root` override; renders nothing when unset. The UI is themed
 * entirely through CSS variables, so overriding `--primary` reaches every component and module
 * with no per-component styling.
 *
 * ⚠ Inline `<style>`, which only works while `style-src` permits inline — BUG-50 tracks tightening
 * that, and this needs a nonce when it does.
 * REFS app/layout.tsx — the only caller, renders it into <head>
 *      proxy.ts — the Content-Security-Policy that currently allows it
 */
export async function BrandingStyle() {
  if (isBuildPhase) return null;
  let accent = "";
  try {
    /*
     * ⚠ The accent is style-specific (CORE-07). A style not listing it carries its own palette and
     * outranks this override anyway, since `:root[data-style=…]` beats bare `:root`.
     * REFS lib/settings.ts › STYLE_SETTINGS — the per-style list this is checked against
     */
    if (!STYLE_SETTINGS[await styleId()]?.includes("branding.accent")) return null;
    accent = await getAccentColor();
  } catch {
    return null; // settings unavailable — keep the default theme
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) return null;

  // `--primary` drives buttons and links; the foreground follows so text stays readable on any
  // chosen colour. Both light and dark inherit this one override.
  const css = `:root{--primary:${accent};--primary-foreground:${contrastOn(accent)};}`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

/**
 * The configured app name, falling back to "JonDash" when settings can't be read.
 *
 * REFS app/layout.tsx · app/manifest.ts · app/api/branding/icon/route.ts · lib/settings.ts
 *      lib/email/send.ts · lib/email/template.ts · lib/modules/context.ts — the name a module sees
 * PINS tests/unit/email-template.test.ts
 */
export async function appName(): Promise<string> {
  if (isBuildPhase) return "JonDash";
  try {
    return (await getAppName()) || "JonDash";
  } catch {
    return "JonDash";
  }
}

/**
 * The chosen interface style id (CORE-07), for the `data-style` attribute on <html> that
 * `globals.css` keys everything off — see docs/STYLES.md.
 *
 * REFS app/layout.tsx — sets the attribute · lib/styles.ts › resolveStylePair()
 *      app/admin/settings/style-form.tsx — where it is chosen · lib/email/template.ts
 */
export async function styleId(): Promise<string> {
  if (isBuildPhase) return "default";
  try {
    const stored = (await getStyleId()) || "default";
    // ⚠ Resolve through the PAIR: a palette promoted between releases can change the style, not
    // just the palette. REFS lib/styles.ts › MOVED — the table that carries those users across
    return resolveStylePair(stored, await getPaletteId()).style;
  } catch {
    return "default";
  }
}

/**
 * The palette for the current style, as the `data-palette` attribute. ⚠ Normalise it — a pairing
 * left over from a previous style matches no CSS at all otherwise.
 * REFS app/layout.tsx — sets the attribute · lib/styles.ts › resolvePalette() · resolveStylePair()
 *      app/admin/settings/style-form.tsx · lib/email/template.ts
 */
export async function paletteId(style: string): Promise<string> {
  if (isBuildPhase) return resolvePalette("default", "").id;
  try {
    // `style` has already been through `resolveStylePair` in `styleId()`, so the stored palette
    // is normalised against the style that will actually be applied.
    return resolveStylePair(await getStyleId(), await getPaletteId()).palette ?? resolvePalette(style, "").id;
  } catch {
    return resolvePalette(style, "").id;
  }
}

/** The configured logo's stored filename, or "" when none is set. Never throws.
 *  REFS app/layout.tsx — cache-busts the icon URLs with it · BrandHeading() · BrandMark() below */
export async function logoFilename(): Promise<string> {
  if (isBuildPhase) return "";
  try {
    return await getLogoFilename();
  } catch {
    return "";
  }
}

/**
 * The large, centred brand for the sign-in and first-run screens, which sit outside the app shell
 * and so never get `BrandMark`. ⚠ The logo route is deliberately readable signed-out for this.
 *
 * ⚠ The lettered fallback mark exists in THREE places and nothing enforces that they agree: here,
 * `BrandMark` below, and `app/api/branding/icon/route.ts`, which redraws it as SVG for the browser
 * tab and the iOS/Android home screen — with a hardcoded fill rather than the live accent. Change
 * the letter, the colour or the corner radius in all three.
 * REFS app/login/page.tsx — the only caller · app/api/branding/logo/route.ts — serves the image
 */
export async function BrandHeading({ subtitle }: { subtitle: string }) {
  const name = await appName();
  const logo = await logoFilename();
  return (
    <div className="mb-6 text-center">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/branding/logo?v=${logo.slice(0, 8)}`}
          alt=""
          width={48}
          height={48}
          className="mx-auto mb-3 h-12 w-12 rounded-2xl object-contain"
        />
      ) : (
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-xl font-bold">
          {name.trim().charAt(0).toUpperCase() || "J"}
        </div>
      )}
      <h1 className="text-xl font-semibold">{name}</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {subtitle}
      </p>
    </div>
  );
}

/**
 * The header brand: the square mark plus the wordmark. `suffix` is the admin header's
 * " Settings", hidden on small screens by the caller.
 *
 * REFS app/(app)/layout.tsx · app/admin/layout.tsx — the two headers
 *      BrandHeading() above — the same mark at sign-in size, and the three-way warning on it
 */
export async function BrandMark({ suffix }: { suffix?: React.ReactNode }) {
  const name = await appName();
  const logo = await logoFilename();

  return (
    <>
      {logo ? (
        /*
         * Plain <img>: our own route serves it, and next/image would need configuring for a
         * dynamic local endpoint to no benefit at 28px. The filename is random per upload, so
         * the URL changes whenever the logo does.
         */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/branding/logo?v=${logo.slice(0, 8)}`}
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 flex-none rounded-lg object-contain"
        />
      ) : (
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
          {name.trim().charAt(0).toUpperCase() || "J"}
        </span>
      )}
      <span className="truncate">
        {name}
        {suffix}
      </span>
    </>
  );
}
