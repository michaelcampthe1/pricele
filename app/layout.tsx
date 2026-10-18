import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { appUrl } from "@/lib/env";
import { adsenseClient } from "@/lib/ads";

const display = localFont({
  src: "./fonts/bricolage.woff2",
  variable: "--font-display",
  weight: "200 800",
  display: "swap",
});

const body = localFont({
  src: "./fonts/instrument-sans.woff2",
  variable: "--font-body",
  weight: "400 700",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: { default: "Pricele — the daily price-guessing game", template: "%s · Pricele" },
  description: "Three real-world prices to guess every day: easy, medium and hard. Score up to 3,000 points and keep your streak alive.",
  applicationName: "Pricele",
  openGraph: {
    type: "website",
    siteName: "Pricele",
    title: "Pricele — the daily price-guessing game",
    description: "Three questions. Three difficulty levels. One new challenge every day.",
  },
  twitter: { card: "summary_large_image" },
  // Lets Google AdSense verify site ownership once a publisher id is configured.
  ...(adsenseClient() ? { other: { "google-adsense-account": adsenseClient()! } } : {}),
};

export const viewport: Viewport = {
  themeColor: "#fafaf7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
