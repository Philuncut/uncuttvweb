import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import MarketingUtmCapture from "@/components/MarketingUtmCapture";
import { CartProvider } from "@/lib/CartContext";
import { LanguageProvider } from "@/lib/LanguageContext";
import NavigationProgress from "@/components/NavigationProgress";
import CookieConsent from "@/components/CookieConsent";
import MetaPixel from "@/components/MetaPixel";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import PayPalRecoveryBoot from "@/components/PayPalRecoveryBoot";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "UncutTV",
  description: "UncutTV Website",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark overflow-x-hidden`}
    >
      <body className="min-h-full flex flex-col pt-[60px]">
        <PayPalRecoveryBoot />
        <NavigationProgress />
        <LanguageProvider>
          <CartProvider>
            <Suspense fallback={null}>
              <MarketingUtmCapture />
            </Suspense>
            {children}
            <CookieConsent />
            <MetaPixel />
            <GoogleAnalytics />
          </CartProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
