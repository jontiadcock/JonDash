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
 * The browser-tab title follows the configured app name (CORE-06), and **every icon now comes from
 * one route** (CORE-15).
 *
 * Previously the tab icon pointed at the uploaded logo *only when one existed*, and otherwise fell
 * through to the bundled `app/favicon.ico` — which had been the stock create-next-app file since the
 * very first commit. An install that had not uploaded a logo, which is most of them, showed
 * **Vercel's triangle**, while the header and sign-in page showed a lettered mark. `/api/branding/icon`
 * serves the logo when there is one and draws the same lettered mark when there is not, so the tab,
 * the phone home screen and the header cannot disagree.
 *
 * `v=` busts the cache when the logo changes; the filename is random per upload, and `name` is in
 * there so renaming an unbranded install repaints the letter too.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [logo, name] = await Promise.all([logoFilename(), appName()]);
  const v = encodeURIComponent(`${logo.slice(0, 8)}-${name.slice(0, 8)}`);
  return {
    title: name,
    description: "Your personal dashboard of services.",
    robots: { index: false, follow: false },
    // `appleTouchIcon` is a separate path: iOS ignores the web app manifest when adding to the home
    // screen, so without this it screenshots the page or shows a blank tile.
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
      // background show through rather than a black band above it.
      statusBarStyle: "black-translucent",
    },
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
