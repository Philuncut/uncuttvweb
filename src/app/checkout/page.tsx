import Navbar from "@/components/Navbar";
import CheckoutForm from "@/components/CheckoutForm";

export const metadata = {
  title: "Checkout — UNCUTTV",
};

export default function CheckoutPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <CheckoutForm />
    </div>
  );
}
