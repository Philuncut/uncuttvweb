import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import OrderSuccess from "@/components/OrderSuccess";

export const metadata = {
  title: "Bestellung erfolgreich — UNCUTTV",
};

export default function ErfolgPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
        <Suspense fallback={null}>
          <OrderSuccess />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
