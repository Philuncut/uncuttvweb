import { redirect } from "next/navigation";
import { getSession, mayEnterHaendlerPortal } from "@/lib/auth-session";

/**
 * Händler gehören ins Portal, nicht in den B2C-Shop.
 *
 * Diese Umleitung stand bis hierher in der middleware.ts und las die Rolle
 * aus einem Cookie, das jeder selbst setzen konnte. Sie sitzt jetzt in den
 * Seiten selbst, wo die geprüfte Sitzung ohnehin vorliegt. Beide
 * Einstiegsseiten sind bereits `force-dynamic`, die Umleitung kostet also
 * keine Vorab-Erzeugung.
 *
 * Administratoren und Shop-Manager sind bewusst ausgenommen: Sie dürfen ins
 * Portal, sollen den normalen Shop aber weiter sehen können.
 */
export async function redirectWholesaleToPortal(): Promise<void> {
  const session = await getSession();
  if (session?.isWholesale) {
    redirect("/haendler/dashboard");
  }
}

/** Kehrseite: Wer nicht ins Portal darf, landet bei der Portal-Anmeldung. */
export async function requirePortalPage(): Promise<void> {
  const session = await getSession();
  if (!session || !mayEnterHaendlerPortal(session)) {
    redirect("/haendler");
  }
}
