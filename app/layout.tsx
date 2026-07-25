import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BrandingStyle, appName, logoFilename, styleId } from "@/app/components/branding";

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
  return (
    <html
      lang="en"
      data-style={style}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <BrandingStyle />
        {children}
      </body>
    </html>
  );
}
