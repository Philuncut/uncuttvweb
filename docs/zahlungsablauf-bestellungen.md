# Zahlungsablauf und Bestellstatus (Stand 19.10.2026)

## Anlass

Am 18./19.10.2026 entstanden zu einer PayPal-Zahlung von 61,80 € drei
Bestellungen #6390, #6391, #6392, alle „In Bearbeitung“. Ursache: Die Woo-
Bestellung wurde erst nach der Zahlung vom Browser angelegt, mit
`status: processing` und `set_paid: true` im selben Aufruf, ohne dass der
Server die Zahlung prüfte oder Wiederholungen erkannte. Der Wiederanlauf-
Mechanismus für PayPal (`PayPalRecoveryBoot`) schickte denselben Body bei
jedem Seitenaufruf erneut, bis eine Antwort durchkam. Details in der
Diagnose-Notiz der Sitzung.

## Grundregel

**Eine Bestellung geht nur auf `processing`, wenn der Server die Zahlung
selbst bei Stripe oder PayPal nachgeladen und Bestellnummer sowie Betrag
abgeglichen hat.** Einzige Stelle dafür: `markiereBestellungBezahlt` in
`src/lib/bestellung-zahlung.ts`. Nie aus dem Frontend, nie per `set_paid`
beim Anlegen.

## Ablauf Stripe (Karte, Klarna, EPS, Apple/Google Pay)

1. Kasse lädt → `/api/create-payment-intent` legt den PaymentIntent an.
   Idempotency-Key `pi-create-<checkoutKey>` (Kassen-Sitzung aus
   `src/lib/checkout-session-key.ts`), damit Doppelaufrufe denselben PI liefern.
2. „Jetzt kaufen“ → `/api/checkout/prepare-order` legt die Woo-Bestellung als
   **pending** an oder findet die offene Bestellung dieser Sitzung
   (`src/lib/offene-bestellung.ts`). Metadaten auf der Bestellung:
   `_stripe_pi_id`, `_uncuttv_payment_ref`, `_uncuttv_checkout_key`,
   `_uncuttv_checkout_fingerprint`. Auf dem PI: `woo_order_id`.
3. Browser bestätigt die Zahlung bei Stripe.
4. **Stripe-Webhook** `payment_intent.succeeded` → `verbucheStripeZahlung`
   (`src/lib/stripe-zahlung.ts`): PI frisch laden, Bestellung über
   `woo_order_id` holen, Betrag vergleichen, `set_paid` per PUT. Woo setzt
   `processing`, `date_paid`, reduziert Lager. Danach Bestätigungsmail und
   Händler-Benachrichtigung (`nachZahlungseingang`).
5. Erfolgsseite ruft `/api/sync-order` als **Abgleich** mit derselben Logik;
   wer zuerst kommt, verbucht, der andere sieht „already_paid“. Ist Stripe
   noch nicht durch, zeigt die Erfolgsseite „Zahlung wird bestätigt“.

## Ablauf PayPal

1. Klick auf den PayPal-Button → `createOrder` ruft `/api/paypal/create-order`:
   Woo-Bestellung pending anlegen/finden, dann PayPal-Order mit dem **Betrag
   der Woo-Bestellung** anlegen (`custom_id` = Bestellnummer,
   `PayPal-Request-Id` aus Sitzung + Bestellnummer). Vorher rechnete der
   Browser den Betrag selbst (#6389: 123,12 € gezahlt, Bestellung 123,11 €).
2. Kunde bestätigt bei PayPal → `onApprove` ruft `/api/paypal/capture-order`:
   Server führt die Capture aus, prüft `custom_id` gegen die Bestellung und
   den Capture-Betrag gegen die Bestellsumme, dann `markiereBestellungBezahlt`.
3. Geht die Antwort verloren, ruft `PayPalRecoveryBoot` beim nächsten Laden
   `capture-order` erneut. PayPal meldet `ORDER_ALREADY_CAPTURED`, der Server
   lädt die Order und liefert dieselbe bezahlte Bestellung. Keine Duplikate.
4. Alte Browser (Capture im Browser, Aufruf von `/api/sync-order` mit
   `paypal_<id>`) werden weiter bedient: Order bei PayPal laden, nur mit
   COMPLETED-Capture und nach Duplikatsuche verbuchen.

## Idempotenz

- Pro Kassen-Sitzung höchstens eine offene Bestellung. Gleicher Fingerabdruck
  (Artikel, Adresse, Versand, Gutschein, Zahlungsweg) → Wiederverwendung;
  anderer Fingerabdruck → alte pending-Bestellung wird storniert, neue angelegt.
- Bezahlen-Knopf und PayPal-Buttons sind während der Verarbeitung gesperrt.
- Webhook: Status- und Event-ID-Prüfung auf der Bestellung; 500 bei
  vorläufigen Fehlern, damit Stripe wiederholt.

## Aufräumen

`GET /api/cron/cancel-stale-pending-orders` (Vercel Cron alle 15 Minuten,
`Authorization: Bearer CRON_SECRET`): Stripe-/PayPal-Bestellungen, die älter
als 60 Minuten und noch `pending` sind, werden storniert (Woo bucht Lager
zurück). Vorher letzte Prüfung bei Stripe/PayPal: Ist doch bezahlt, wird die
Bestellung bezahlt statt storniert. Vorkasse (`bacs`) wird nie angefasst.
Stripe-PaymentIntents stornierter Bestellungen werden mitstorniert.

## Betragsabweichung

Weichen Zahlungsbeleg und Bestellsumme um mehr als 5 Cent ab
(`BETRAG_TOLERANZ_CENT`), geht die Bestellung auf **on-hold** mit Notiz statt
auf processing. Geld ist da, aber jemand muss hinschauen.

## Was in Stripe, PayPal und WooCommerce einzustellen ist

- Stripe Dashboard → Webhooks: Endpunkt `https://uncuttv.at/api/webhooks/stripe`
  mit `payment_intent.succeeded` und `payment_intent.payment_failed`, Signing
  Secret als `STRIPE_WEBHOOK_SECRET` in Vercel. Zustellungen müssen 2xx sein.
- PayPal: `PAYPAL_SECRET` (zum vorhandenen `NEXT_PUBLIC_PAYPAL_CLIENT_ID`) in
  Vercel; war in `.env.local` bereits vorhanden. Optional `PAYPAL_API_BASE`
  für die Sandbox.
- Vercel: neuer Cron aus `vercel.json` wird mit dem Deployment aktiv;
  `CRON_SECRET` muss gesetzt sein (ist es für die bestehenden Crons).
- WooCommerce → Einstellungen → Produkte → Lagerbestand: „Lagerbestand
  halten (Minuten)“ **nicht** als Ersatz für den Cron einschalten; es würde
  auch die Vorkasse-Bestellungen (pending) stornieren.
- WooCommerce: Die Bestell-E-Mails von WordPress schlagen fehl („E-Mail-
  Funktion konnte nicht instanziiert werden“); der Shop verschickt über
  Resend. Unverändert, aber die Notizen füllen das Protokoll.
