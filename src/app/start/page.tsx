import type { Metadata } from "next";
import Footer from "@/components/Footer";
import StartContent from "@/components/weiche/StartContent";
import Weiche from "@/components/weiche/Weiche";
import { AUFTAKT_SKRIPT } from "@/components/weiche/auftakt";
import { getShopCatalog } from "@/lib/shop-catalog";
import type { ShopListProduct } from "@/lib/types";

/**
 * /start — die Weiche zwischen den drei UncutTV-Auftritten: Streaming
 * (uncuttv.app), Shop (/shop) und Social (tv.uncuttv.at).
 *
 * Noch nicht die Startseite: Die Umleitung von / nach /shop in
 * next.config.ts bleibt, bis die Weiche live geht. Bis dahin ist die Seite
 * nirgends verlinkt und steht auf noindex, siehe `robots` unten.
 *
 * Die Seite selbst hat keinen Zugriff auf Cookies oder Kopfzeilen und kann
 * deshalb statisch gebaut werden; die Produkte kommen aus demselben
 * Cache-Eintrag wie im Shop und werden mit `revalidate` einmal pro Minute
 * nachgezogen.
 */

export const revalidate = 60;

export const metadata: Metadata = {
  title: "UncutTV — Streaming, Shop und Social",
  description:
    "Das unabhängige Filmlabel aus Österreich: ungekürzte Filme im Streaming, Mediabooks und Blu-rays im Shop, Videos und Livestreams bei Social. Wähle deinen Einstieg.",
  // VOR DEM LAUNCH ENTFERNEN: Solange /start nicht verlinkt ist, soll die
  // Seite nicht im Index landen. Sobald sie die Startseite wird, fällt
  // dieser Block weg und die Seite wird normal indexiert.
  robots: { index: false, follow: false },
};

/** Wie viele Produkte unter der Weiche stehen. */
const ANZAHL_NEUESTE = 3;

export default async function StartPage() {
  let neueste: ShopListProduct[] = [];
  try {
    const { products } = await getShopCatalog();
    // WooCommerce liefert die Liste neueste zuerst (Standardsortierung
    // nach Datum, absteigend); ein eigenes Datumsfeld ist in
    // SHOP_LIST_FIELDS nicht enthalten.
    neueste = products.slice(0, ANZAHL_NEUESTE);
  } catch (err) {
    // Ohne Katalog steht die Weiche trotzdem; unten fehlt dann nur die
    // Produktreihe.
    console.error("[start] Katalog konnte nicht geladen werden", err);
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Entscheidet vor dem ersten Bild, ob der Auftakt läuft, und muss
          deshalb VOR der Weiche stehen. Siehe components/weiche/auftakt.ts.
          Kommt man per clientseitiger Navigation hierher, führt React das
          Skript nicht aus; dann steht die Weiche ohne Auftakt da. */}
      <script dangerouslySetInnerHTML={{ __html: AUFTAKT_SKRIPT }} />
      <Weiche />
      <main>
        <StartContent products={neueste} />
      </main>
      <Footer />
    </div>
  );
}
