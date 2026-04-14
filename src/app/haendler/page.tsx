import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import HaendlerAuth from "@/components/HaendlerAuth";

export const metadata = {
  title: "Händlerportal — UNCUTTV",
};

export default async function HaendlerPage() {
  const cookieStore = await cookies();
  const haendlerToken = cookieStore.get("haendler_token")?.value;

  if (haendlerToken) {
    redirect("/haendler/dashboard");
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <main className="mx-auto max-w-md px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-center text-lg font-black text-white sm:text-2xl sm:tracking-[0.1em] md:text-3xl md:tracking-[0.15em]">
          HÄNDLERPORTAL
        </h1>
        <p className="mt-3 text-center text-sm text-white/40">
          Exklusive Händlerpreise für autorisierte Fachhändler.
        </p>
        <div className="mt-8">
          <HaendlerAuth />
        </div>
      </main>
      <Footer />
    </div>
  );
}
