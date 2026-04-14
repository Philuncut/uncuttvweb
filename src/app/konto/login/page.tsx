import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AuthForms from "@/components/AuthForms";

export const metadata = {
  title: "Anmelden — UNCUTTV",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <main className="mx-auto max-w-md px-4 py-12 sm:px-6 sm:py-16">
        <AuthForms />
      </main>
      <Footer />
    </div>
  );
}
