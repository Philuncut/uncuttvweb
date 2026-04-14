import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import HaendlerDashboard from "@/components/HaendlerDashboard";

export const metadata = {
  title: "Händler Dashboard — UNCUTTV",
};

export default function HaendlerDashboardPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <HaendlerDashboard />
      </main>
      <Footer />
    </div>
  );
}
