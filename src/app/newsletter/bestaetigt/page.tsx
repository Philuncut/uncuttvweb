import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import NewsletterBestaetigt from "@/components/NewsletterBestaetigt";

/**
 * Ziel nach dem Klick auf den Bestätigungslink in der Ghost-Mail
 * (Double-Opt-in, src/lib/newsletter.ts). Ghost leitet auf seine eigene
 * Domain (/weiter/shop/), eine Weiterleitung in Ghost Admin bringt die
 * Person hierher. Die Seite bestätigt nur; eingetragen hat Ghost die
 * Adresse schon beim Klick, und der Webhook schickt den Rabattcode.
 */
export const metadata = {
  title: "Newsletter bestätigt — UNCUTTV",
  robots: { index: false, follow: false },
};

export default function NewsletterBestaetigtPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <NewsletterBestaetigt />
      </main>
      <Footer />
    </div>
  );
}
