import { NextResponse } from "next/server";
import { normalizeCartMetaItems } from "@/lib/cart-items-from-context";
import {
  istHaendlerSitzung,
  pruefeBestellpositionen,
} from "@/lib/bestellpruefung";
import type { CartMeta } from "@/lib/wc-order-from-payment";

export const dynamic = "force-dynamic";

type Body = {
  items?: CartMeta[];
  isWholesale?: boolean;
  isReverseCharge?: boolean;
};

/**
 * POST /api/checkout/pruefung
 *
 * Die Kasse fragt vor einer Zahlung, die der Server nicht selbst anstößt
 * (PayPal-Knopf), ob der Warenkorb so bestellbar ist: Produkte, Größen,
 * Lager, Verkaufszeitraum, Preise frisch aus WooCommerce. Antwort wie
 * pruefeBestellpositionen; die Kasse übernimmt `repriced` in den Warenkorb
 * und zeigt `problems`.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const items = normalizeCartMetaItems(body.items);
  if (items.length === 0) {
    return NextResponse.json(
      { error: "no_cart_items", message: "Der Warenkorb ist leer." },
      { status: 400 }
    );
  }
  try {
    const haendlerSitzung = await istHaendlerSitzung();
    const ergebnis = await pruefeBestellpositionen(items, {
      isWholesale: body.isWholesale === true,
      isReverseCharge: body.isReverseCharge === true,
      haendlerKonto: haendlerSitzung,
    });
    return NextResponse.json(ergebnis);
  } catch (err) {
    console.error("[checkout/pruefung]", err);
    return NextResponse.json(
      {
        error: "pruefung_failed",
        message:
          "Der Warenkorb konnte nicht geprüft werden. Bitte noch einmal versuchen.",
      },
      { status: 502 }
    );
  }
}
