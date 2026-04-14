import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import HaendlerProduct from "@/components/HaendlerProduct";

export const metadata = {
  title: "Produkt — Händlerportal UNCUTTV",
};

export default async function HaendlerProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("haendler_token")?.value;

  if (!token) {
    redirect("/haendler");
  }

  const { slug } = await params;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <HaendlerProduct slug={slug} />
      </main>
      <Footer />
    </div>
  );
}
