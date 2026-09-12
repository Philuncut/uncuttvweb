import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-session";

export default async function KontoPage() {
  // Vorher genuegte ein selbst gesetztes Cookie `woo_customer_id`, um hier
  // durchzukommen. Jetzt entscheidet das geprueftes Token.
  const session = await getSession();

  if (session) {
    redirect("/konto/dashboard");
  }

  redirect("/konto/login?redirect=/konto");
}
