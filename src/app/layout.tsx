import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CartProvider } from "@/lib/CartContext";
import { LanguageProvider } from "@/lib/LanguageContext";
import NavigationProgress from "@/components/NavigationProgress";
import CookieConsent from "@/components/CookieConsent";
import MetaPixel from "@/components/MetaPixel";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import IntroLoaderClient from "@/components/IntroLoaderClient";
import { INTRO_LOADER_BOOT_SCRIPT } from "@/lib/intro-loader-boot";
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
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/favicon.svg",
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
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: INTRO_LOADER_BOOT_SCRIPT }}
        />
      </head>
      <body className="min-h-full flex flex-col pt-[60px]">
        <div className="intro-overlay" id="intro-overlay">
          <div className="intro-scanlines" aria-hidden />
          <div className="intro-noise" aria-hidden />
          <div className="intro-content">
            <h1 className="intro-logo">
              <span className="intro-uncut" data-text="UNCUT">
                UNCUT
              </span>
              <span className="intro-tv" data-text="TV">
                TV
              </span>
            </h1>
            <div className="intro-progress">
              <div className="intro-progress-track">
                <div className="intro-progress-fill" />
              </div>
              <div className="intro-progress-text">LOADING...</div>
            </div>
          </div>
          <div className="intro-vignette" aria-hidden />
        </div>
        <IntroLoaderClient />
        <NavigationProgress />
        <LanguageProvider>
          <CartProvider>
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
