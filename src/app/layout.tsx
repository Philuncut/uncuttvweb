import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CartProvider } from "@/lib/CartContext";
import { LanguageProvider } from "@/lib/LanguageContext";
import NavigationProgress from "@/components/NavigationProgress";
import CookieConsent from "@/components/CookieConsent";
import MetaPixel from "@/components/MetaPixel";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import IntroLoader from "@/components/IntroLoader";
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
      <body className="min-h-full flex flex-col pt-[60px]">
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
