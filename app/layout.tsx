import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "Pricele — the daily price-guessing game", template: "%s · Pricele" },
  description: "Three questions. Three difficulty levels. One new challenge every day. Guess the price, earn up to 3,000 points.",
  applicationName: "Pricele",
  openGraph: {
    type: "website",
    siteName: "Pricele",
    title: "Pricele — the daily price-guessing game",
    description: "Three questions. Three difficulty levels. One new challenge every day.",
    url: "/",
  },
  twitter: { card: "summary_large_image", title: "Pricele", description: "Think you know what things cost?" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#faf8f4",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
