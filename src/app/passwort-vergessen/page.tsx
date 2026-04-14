import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PasswordResetForm from "@/components/PasswordResetForm";

export const metadata = {
  title: "Passwort vergessen — UNCUTTV",
};

export default function PasswortVergessenPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <main className="mx-auto max-w-md px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="border-l-4 border-[#c0392b] pl-4 text-lg font-black text-white sm:text-2xl sm:tracking-[0.1em] md:text-3xl md:tracking-[0.15em]">
          PASSWORT VERGESSEN
        </h1>
        <p className="mt-3 text-sm text-white/50">
          Gib deine E-Mail-Adresse ein und wir senden dir einen Link zum
          Zurücksetzen deines Passworts.
        </p>
        <div className="mt-8">
          <PasswordResetForm />
        </div>
      </main>
      <Footer />
    </div>
  );
}
