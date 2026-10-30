# Stripe Webhook Setup (Phase 2 — der Webhook setzt Bestellungen auf bezahlt)

Endpoint: `POST /api/webhooks/stripe`

Behandelte Events:

- `payment_intent.succeeded` → Bestellung wird serverseitig geprüft und auf
  `processing` gesetzt (`src/lib/stripe-zahlung.ts`, `src/lib/bestellung-zahlung.ts`).
- `payment_intent.payment_failed` → Bestellnotiz, Bestellung bleibt `pending`.

Bis Oktober 2026 hat der Webhook nur geloggt („Phase 1“); den Status setzte
das Frontend über `/api/sync-order` mit `set_paid`. Das führte zu
Bestellungen „In Bearbeitung“ ohne Zahlung und zu Duplikaten (#6390–#6392).
Jetzt ist der Webhook (bzw. der serverseitige Abgleich mit demselben Code)
der einzige Weg auf `processing`. **Ohne funktionierenden Webhook bleiben
Stripe-Bestellungen `pending` und werden nach 60 Minuten vom Cron
`cancel-stale-pending-orders` storniert.** Der Abgleich über `/api/sync-order`
(Erfolgsseite) fängt den Normalfall ab, aber nicht Klarna/EPS-Zahlungen, bei
denen der Kunde die Erfolgsseite nie erreicht.

Ablauf einer Zahlung (siehe auch `docs/zahlungsablauf-bestellungen.md`):

1. Kasse legt PaymentIntent an (`/api/create-payment-intent`, Idempotency-Key
   aus der Kassen-Sitzung).
2. Klick auf „Jetzt kaufen“ → `/api/checkout/prepare-order` legt die
   Woo-Bestellung als `pending` an und schreibt `woo_order_id` in die
   PI-Metadaten.
3. Stripe bestätigt → Webhook → Bestellung `processing`, Bestätigungsmail.

## Environment variables

| Variable | Where |
|----------|--------|
| `STRIPE_SECRET_KEY` | Bereits vorhanden (Checkout) |
| `STRIPE_WEBHOOK_SECRET` | Signing Secret des Endpunkts (Dashboard) bzw. aus `stripe listen` (lokal) |

### Local (`.env.local`)

```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxx
```

Restart `npm run dev` after changing `.env.local`.

### Vercel (Production / Preview)

1. Project → **Settings** → **Environment Variables**
2. Add `STRIPE_WEBHOOK_SECRET` with the **Signing secret** from the Stripe Dashboard endpoint (starts with `whsec_`).
3. Redeploy so the route picks up the variable.

Use **test** secrets with test mode keys and **live** secrets with live keys — they must match the same Stripe mode.

## Local testing with Stripe CLI

### 1. Install Stripe CLI

- Windows (Scoop): `scoop install stripe`
- Windows (winget): `winget install Stripe.StripeCLI`
- macOS: `brew install stripe/stripe-cli/stripe`
- Docs: https://docs.stripe.com/stripe-cli

### 2. Log in

```bash
stripe login
```

### 3. Start the Next.js dev server

```bash
npm run dev
```

Default: http://localhost:3000

### 4. Forward webhooks to your app

In a **second terminal**:

```bash
stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
```

Copy the signing secret from the output, e.g.:

```text
Ready! Your webhook signing secret is whsec_...
```

Put that value in `.env.local` as `STRIPE_WEBHOOK_SECRET`, then **restart** `npm run dev`.

Keep `stripe listen` running while testing.

### 5. Trigger a test event

Ein echter Durchlauf braucht eine Bestellung: Kasse im Test-Modus öffnen,
mit Testkarte `4242 4242 4242 4242` zahlen. Erwartet im Server-Log:

```text
[prepare-order] pi=pi_... -> #<Nr> (pending, <Cent> Cent)
[stripe-webhook] payment_intent.succeeded pi=pi_... ... woo_order_id=<Nr>
[bestellung-zahlung] #<Nr> bezahlt (stripe, Stripe-Webhook evt_..., pi_...)
```

`stripe trigger payment_intent.succeeded` erzeugt einen PI ohne Bestellung
und ohne `cart_snapshot`; der Webhook antwortet dann 200 mit
`unresolved: "no_order_no_cart"` und loggt einen Fehler. Das ist gewollt.

### 6. Invalid signature test

With the dev server running (signature header present but invalid):

```bash
curl -X POST http://localhost:3000/api/webhooks/stripe -H "stripe-signature: invalid" -d "{}"
```

Expected: HTTP **400** and a log line about invalid signature (no secret values in the response body).

## Production webhook (Stripe Dashboard)

1. Open https://dashboard.stripe.com/webhooks (use **Test** or **Live** mode as appropriate).
2. **Add endpoint**
3. **Endpoint URL:** `https://uncuttv.at/api/webhooks/stripe`
4. **Events to send:**
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
5. After creation, open the endpoint → **Signing secret** → copy `whsec_...` into Vercel as `STRIPE_WEBHOOK_SECRET` for that environment.
6. Prüfen, dass der Endpunkt im Dashboard **aktiv** ist und die letzten
   Zustellungen 2xx melden. Ein 500 heißt: Woo oder Stripe war nicht
   erreichbar, Stripe wiederholt automatisch.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `500 webhook_not_configured` | Set `STRIPE_WEBHOOK_SECRET` and restart dev / redeploy |
| `400 invalid_signature` with CLI | Secret from `stripe listen` must match `.env.local`; restart dev after updating |
| No logs | Confirm URL path is `/api/webhooks/stripe` and `stripe listen` is forwarding |
| Wrong mode | CLI uses test mode by default; use test API keys in `.env.local` |
| Bestellung bleibt `pending` trotz Zahlung | Webhook-Zustellung im Dashboard prüfen; der Cron `cancel-stale-pending-orders` holt eine bei Stripe erfolgreiche Zahlung vor dem Stornieren nach |
| Bestellung `on-hold` mit Notiz „Betrag passt nicht“ | Zahlungsbetrag und Bestellsumme weichen um mehr als 5 Cent ab; manuell prüfen |
