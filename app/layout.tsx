import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BrandingStyle, appName } from "@/app/components/branding";

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
  return {
    title: await appName(),
    description: "Your personal dashboard of services.",
    robots: { index: false, follow: false },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <BrandingStyle />
        {children}
      </body>
    </html>
  );
}
