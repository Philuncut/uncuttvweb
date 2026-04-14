import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Dashboard from "@/components/Dashboard";

export const metadata = {
  title: "Mein Konto — UNCUTTV",
};

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <Dashboard />
      </main>
      <Footer />
    </div>
  );
}
