# Stripe Webhook Setup (Phase 1 — Logging only)

Endpoint: `POST /api/webhooks/stripe`

Handled events:

- `payment_intent.succeeded`
- `payment_intent.payment_failed`

Phase 1 does **not** create WooCommerce orders — it only verifies signatures and logs events.

## Environment variables

| Variable | Where |
|----------|--------|
| `STRIPE_SECRET_KEY` | Already required (existing checkout) |
| `STRIPE_WEBHOOK_SECRET` | **New** — signing secret from Stripe CLI (local) or Dashboard (production) |

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

In a **third terminal**:

```bash
stripe trigger payment_intent.succeeded
```

Expected in the **Next.js** server logs:

```text
[stripe-webhook] Webhook received: payment_intent.succeeded
[stripe-webhook] PI: pi_...
[stripe-webhook] Amount: ...
[stripe-webhook] Status: succeeded
[stripe-webhook] Metadata: { ... }
```

Optional:

```bash
stripe trigger payment_intent.payment_failed
```

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

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `500 webhook_not_configured` | Set `STRIPE_WEBHOOK_SECRET` and restart dev / redeploy |
| `400 invalid_signature` with CLI | Secret from `stripe listen` must match `.env.local`; restart dev after updating |
| No logs | Confirm URL path is `/api/webhooks/stripe` and `stripe listen` is forwarding |
| Wrong mode | CLI uses test mode by default; use test API keys in `.env.local` |
