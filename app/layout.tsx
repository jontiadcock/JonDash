import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BrandingStyle, appName, logoFilename, styleId, paletteId } from "@/app/components/branding";
import { ScrollToTop } from "@/app/components/scroll-to-top";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * The tab title follows the configured app name (CORE-06), and every icon comes from one route
 * (CORE-15) — never a bundled `favicon.ico`, which is how an unbranded install ended up showing a
 * stock logo in the tab while the header showed a lettered mark.
 *
 * ⚠ `v=` must include the NAME as well as the logo filename: renaming an unbranded install changes
 * the drawn letter, and without it the old icon stays cached.
 * REFS app/api/branding/icon/route.ts — what serves them · app/manifest.ts — the Android half
 */
export async function generateMetadata(): Promise<Metadata> {
  const [logo, name] = await Promise.all([logoFilename(), appName()]);
  const v = encodeURIComponent(`${logo.slice(0, 8)}-${name.slice(0, 8)}`);
  return {
    title: name,
    description: "Your personal dashboard of services.",
    robots: { index: false, follow: false },
    // ⚠ The Apple touch icon is separate: iOS ignores the web app manifest when adding to the
    // home screen, so without it you get a screenshot of the page or a blank tile.
    icons: {
      icon: [
        { url: `/api/branding/icon?size=32&v=${v}`, sizes: "32x32", type: "image/png" },
        { url: `/api/branding/icon?size=192&v=${v}`, sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: `/api/branding/icon?size=180&v=${v}`, sizes: "180x180", type: "image/png" }],
    },
    appleWebApp: {
      capable: true,
      title: name,
      // The status bar sits over the app in standalone mode; translucent lets the page's own
      // background show through instead of a black band.
      statusBarStyle: "black-translucent",
    },
    /*
     * ⚠ DO NOT delete this because a linter calls it deprecated. `appleWebApp.capable` above emits
     * only the unprefixed `mobile-web-app-capable`; iOS Safari still reads ONLY the `apple-`
     * prefixed name, so without it Add to Home Screen produces a Safari shortcut with an address
     * bar rather than a standalone app. Both are emitted: one correct, one that works today.
     * Remove it when iOS honours the standard name. REFS app/manifest.ts
     */
    other: { "apple-mobile-web-app-capable": "yes" },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The whole style system hangs off this one attribute (CORE-07 / docs/STYLES.md).
  const style = await styleId();
  const palette = await paletteId(style);
  return (
    <html
      lang="en"
      data-style={style}
      data-palette={palette}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <BrandingStyle />
        {children}
        {/*
          EVERY page, not just the signed-in ones (owner, 2026-07-28: *"make this permanent on
          all pages after you scroll down on a mobile"*). It lived in the app and admin layouts,
          which left it off sign-in, first-run setup, the recovery-code page and a module's own
          page — several of which are long on a phone, and the last of which a module author
          controls the length of entirely.

          Here rather than nested: it is fixed to the viewport, so an ancestor with a transform
          would silently become its containing block and it would scroll away with the content
          (BUG-23). The body has none, and there is nowhere higher to put it.
        */}
        <ScrollToTop />
      </body>
    </html>
  );
}
