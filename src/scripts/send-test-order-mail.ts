/**
 * Schickt Beispiel-Bestellbestätigungen (Sofortzahlung deutsch, Banküberweisung
 * deutsch und englisch, jeweils Endkunde) über Resend an office@uncuttv.at,
 * damit der Banner "Jetzt streamen auf UncutTV" in echten Mailprogrammen
 * geprüft werden kann. Die Sofortzahlungs-Mail kennt keine Sprache und ist
 * immer deutsch, daher gibt es von ihr keine englische Variante.
 *
 * Usage: npx tsx src/scripts/send-test-order-mail.ts [--dry-run]
 *   --dry-run          schreibt nur HTML-Dateien nach ./tmp-mail-preview/, sendet nichts
 *   TEST_MAIL_TO=...   anderer Empfänger (Standard: office@uncuttv.at)
 *
 * Requires .env.local with RESEND_API_KEY.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(filename: string): void {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(".env.local");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const to = process.env.TEST_MAIL_TO || "office@uncuttv.at";

  const {
    buildBankTransferEmailHtml,
    buildCustomerEmailHtml,
    BANK_CUSTOMER_FROM,
    CUSTOMER_FROM,
  } = await import("@/lib/order-confirmation-email");

  const order = {
    id: 999999,
    number: "TEST-999999",
    status: "processing",
    currency: "EUR",
    total: "64.80",
    date_paid: new Date().toISOString(),
    payment_method_title: "Kreditkarte (Test)",
    billing: {
      first_name: "Erika",
      last_name: "Muster",
      email: to,
      address_1: "Musterweg 1",
      postcode: "6020",
      city: "Innsbruck",
      country: "AT",
    },
    line_items: [
      { name: "VHS Underground Mediabook Cover F", quantity: 1, total: "34.90" },
      { name: "Catcall Blu-Ray Amaray", quantity: 1, total: "24.90" },
    ],
    shipping_lines: [{ method_title: "Post AT", total: "5.00" }],
  };

  const mails = [
    {
      from: CUSTOMER_FROM,
      subject:
        "[TEST Banner] Deine UncutTV-Bestellung #TEST-999999 ist eingegangen",
      html: buildCustomerEmailHtml(order, {
        pdfAttached: false,
        orderId: order.id,
        isWholesale: false,
      }),
      file: "stripe-b2c.html",
    },
    {
      from: BANK_CUSTOMER_FROM,
      subject:
        "[TEST Banner] Bestellbestätigung Banküberweisung #TEST-999999",
      html: buildBankTransferEmailHtml(
        order.number,
        {
          customerName: "Erika Muster",
          items: [
            {
              id: 101,
              name: "VHS Underground Mediabook Cover F",
              qty: 1,
              price: "34.90",
            },
            { id: 102, name: "Catcall Blu-Ray Amaray", qty: 1, price: "24.90" },
          ],
          total: "64.80",
          isWholesale: false,
          locale: "de",
        },
        { pdfAttached: false, orderId: order.id }
      ),
      file: "bank-b2c.html",
    },
    {
      from: BANK_CUSTOMER_FROM,
      subject:
        "[TEST Banner EN] Order confirmation bank transfer #TEST-999999",
      html: buildBankTransferEmailHtml(
        order.number,
        {
          customerName: "Erika Muster",
          items: [
            {
              id: 101,
              name: "VHS Underground Mediabook Cover F",
              qty: 1,
              price: "34.90",
            },
            { id: 102, name: "Catcall Blu-Ray Amaray", qty: 1, price: "24.90" },
          ],
          total: "64.80",
          isWholesale: false,
          locale: "en",
        },
        { pdfAttached: false, orderId: order.id }
      ),
      file: "bank-b2c-en.html",
    },
  ];

  if (dryRun) {
    const dir = resolve(process.cwd(), "tmp-mail-preview");
    mkdirSync(dir, { recursive: true });
    for (const m of mails) {
      writeFileSync(resolve(dir, m.file), m.html, "utf8");
      console.log("written", resolve(dir, m.file));
    }
    return;
  }

  const key = process.env.RESEND_API_KEY;
  if (!key || key === "your_resend_api_key") {
    throw new Error("RESEND_API_KEY fehlt in .env.local");
  }
  const { Resend } = await import("resend");
  const resend = new Resend(key);

  for (const m of mails) {
    const result = await resend.emails.send({
      from: m.from,
      to,
      subject: m.subject,
      html: m.html,
    });
    if (result.error) {
      console.error("FEHLER", m.subject, result.error);
      process.exitCode = 1;
    } else {
      console.log("gesendet", m.subject, "->", to, "id", result.data?.id);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
