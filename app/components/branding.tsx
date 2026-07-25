import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { getAccentColor, getAppName } from "@/lib/settings";

/**
 * During `next build` there is no database — JonDash builds on each machine, often before
 * `prisma migrate` has run. Querying anyway still *works* (the read is caught below) but
 * Prisma logs `prisma:error` first, so every build printed alarming errors for a
 * perfectly healthy install. Skip the read entirely in that phase and use the defaults.
 */
const isBuildPhase = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;

/**
 * Rebranding (CORE-06) runtime.
 *
 * The UI is themed entirely through CSS variables (`--primary`, `--background`, …), so an
 * instance-wide accent is just an override of `--primary` on `:root` — no per-component
 * styling, and it inherits everywhere including modules. Emitted as an inline `<style>`
 * (allowed: `style-src` still permits inline — BUG-50 tracks tightening that, and this will
 * need a nonce when it does).
 *
 * Everything here is best-effort: a settings read that fails (no DB yet during a build-time
 * prerender, for instance) must not take the page down, so callers get the stock look.
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

/** Instance accent colour, injected as a `:root` override. Renders nothing when unset. */
export async function BrandingStyle() {
  if (isBuildPhase) return null;
  let accent = "";
  try {
    accent = await getAccentColor();
  } catch {
    return null; // settings unavailable — keep the default theme
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) return null;

  // `--primary` drives buttons/links; its foreground follows so text on the accent stays
  // readable whatever colour is picked. Both light and dark inherit this single override.
  const css = `:root{--primary:${accent};--primary-foreground:${contrastOn(accent)};}`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

/** The configured app name, falling back to "JonDash" if settings can't be read. */
export async function appName(): Promise<string> {
  if (isBuildPhase) return "JonDash";
  try {
    return (await getAppName()) || "JonDash";
  } catch {
    return "JonDash";
  }
}

/**
 * The header brand: the square mark (first letter of the app name) plus the wordmark.
 * `suffix` is the admin header's " Settings", hidden on small screens by the caller.
 */
export async function BrandMark({ suffix }: { suffix?: React.ReactNode }) {
  const name = await appName();
  return (
    <>
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
        {name.trim().charAt(0).toUpperCase() || "J"}
      </span>
      <span className="truncate">
        {name}
        {suffix}
      </span>
    </>
  );
}
