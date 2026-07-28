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

// The browser-tab title follows the configured app name (CORE-06). Async so it can read
// the setting; falls back to the stock name if settings aren't available.
export async function generateMetadata(): Promise<Metadata> {
  // The uploaded logo doubles as the browser-tab icon; without one the bundled favicon
  // stands. Failure here must not take the page down, so it falls back silently.
  const logo = await logoFilename();
  return {
    title: await appName(),
    description: "Your personal dashboard of services.",
    robots: { index: false, follow: false },
    ...(logo ? { icons: { icon: `/api/branding/logo?v=${logo.slice(0, 8)}` } } : {}),
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
