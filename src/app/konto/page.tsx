import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function KontoPage() {
  const cookieStore = await cookies();
  const customerId = cookieStore.get("woo_customer_id")?.value;

  if (customerId) {
    redirect("/konto/dashboard");
  } else {
    redirect("/konto/login");
  }
}
