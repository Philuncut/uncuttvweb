import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PasswordNewForm from "@/components/PasswordNewForm";

export const metadata = {
  title: "Neues Passwort | UNCUTTV",
  // Ziel des Links aus der Passwortmail; ohne Sitzung im Fragment nutzlos,
  // also nichts fuer den Index.
  robots: { index: false, follow: false },
};

/**
 * Ziel des Links aus der Passwortmail des Identitätsdienstes.
 *
 * Supabase hängt die Wiederherstellungssitzung als Fragment an
 * (#access_token=…&refresh_token=…&type=recovery). Das Fragment erreicht
 * den Server nie; das Formular liest es im Browser und schickt das Token an
 * /api/auth/reset-password, wo der Dienst das neue Passwort an beiden
 * Stellen setzt.
 */
export default function PasswortNeuPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <main className="mx-auto max-w-md px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="border-l-4 border-[#c0392b] pl-4 text-lg font-black text-white sm:text-2xl sm:tracking-[0.1em] md:text-3xl md:tracking-[0.15em]">
          NEUES PASSWORT
        </h1>
        <p className="mt-3 text-sm text-white/50">
          Wähle ein neues Passwort. Es gilt für den Shop, die App und
          uncuttv.app gleichermaßen.
        </p>
        <div className="mt-8">
          <PasswordNewForm />
        </div>
      </main>
      <Footer />
    </div>
  );
}
