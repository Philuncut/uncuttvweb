import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CartProvider } from "@/lib/CartContext";
import { LanguageProvider } from "@/lib/LanguageContext";
import NavigationProgress from "@/components/NavigationProgress";
import CookieConsent from "@/components/CookieConsent";
import MetaPixel from "@/components/MetaPixel";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import IntroLoader from "@/components/IntroLoader";
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
        <div
          id="intro-overlay-skeleton"
          className="intro-overlay intro-overlay-skeleton fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black"
          aria-hidden
        >
          <div
            className="select-none text-center font-black tracking-wider"
            style={{ fontSize: "clamp(4rem, 14vw, 6rem)", lineHeight: 1 }}
          >
            <span className="text-white">UNCUT</span>
            <span className="text-[#c0392b]">TV</span>
          </div>
          <div className="intro-overlay-skeleton__track mt-10 h-1 w-[min(280px,80vw)] overflow-hidden bg-[#1a1a1a]">
            <div className="intro-overlay-skeleton__bar h-full bg-white" />
          </div>
        </div>
        <IntroLoader />
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
