# WordPress / WPCode snippets (UncutTV)

Snippets run on **wp.uncuttv.at** via [WPCode](https://wpcode.com/). The Next.js app (`uncuttvweb`) creates orders through the WooCommerce REST API; these hooks fix gaps WC cannot express in the payload alone.

| Snippet | File | Status |
|---------|------|--------|
| Reverse Charge — force zero tax | *(existing in WP, not in this repo)* | Production |
| **Preserve explicit shipping tax (REST)** | `uncuttv-preserve-shipping-tax-rest.php` | **Deploy via WPCode** |

---

## UncutTV — Preserve Explicit Shipping Tax from REST API

### Problem

WC ignores `shipping_lines[].taxes[]` on REST order create and recomputes shipping tax as `round(net × rate)`, which can be **1 ct low** vs our gross split (`splitGrossForWooRest` in `src/lib/woo-vat-split.ts`).

Example **DE 19%**, GLS **€7,80**:

| | Net | Tax | Gross |
|---|-----|-----|-------|
| uncuttvweb sends | 6.55 | **1.25** | 7.80 |
| WC stores | 6.55 | **1.24** | 7.79 |
| Stripe / checkout | — | — | **44.70** |
| WC order total (no coupon) | — | — | **44.69** |

### Install

1. **Backup:** WPCode → export all snippets.
2. **Add snippet:** Code Snippets → Add New → PHP Snippet.
3. **Name:** `UncutTV — Preserve Explicit Shipping Tax from REST API`
4. **Code:** paste from [`uncuttv-preserve-shipping-tax-rest.php`](./uncuttv-preserve-shipping-tax-rest.php) (omit duplicate `<?php` if WPCode wraps snippets automatically).
5. **Location:** Run Everywhere (or Frontend + Admin).
6. **Activate.**

### Test plan

**Before:** note a failing order (e.g. DE, Cover F, GLS €7,80, no coupon) — WC total €44,69 vs Stripe €44,70.

1. Activate snippet.
2. **DE B2C** — Cover F + GLS €7,80, no coupon (Stripe or bank).
3. WC Admin order:
   - Shipping: €6,55 + **€1,25** = **€7,80**
   - Order total: **€44,70**
   - Order note: `Shipping tax preserved from REST payload: WC calculated 1.24 → explicit 1.25`
4. PDF: Versand €7,80, Gesamt €44,70.

**Regression (should stay correct, no spurious notes):**

| Case | Shipping gross | Notes |
|------|----------------|-------|
| AT B2C + Post.at | €5,38 | AT path, no EU explicit taxes[] |
| IT B2C + GLS | €13,90 | EU-B2C |
| Wholesale RC | €10,00 @ 0% | `total_tax` 0.00 = WC 0.00 → hook skips |
| DE + welcome10 | €7,80 | Order total **€41,01** |

5. **Stripe** sync order (not only bank transfer).

### Rollback

Deactivate the WPCode snippet. No DB migration. Next.js `taxes[]` on shipping lines can stay (harmless); the hook is the authoritative fix.

### Related code (uncuttvweb)

- `src/lib/wc-order-from-payment.ts` — Stripe → WC order
- `src/app/api/create-bank-order/route.ts` — bank transfer
- `src/lib/woo-vat-split.ts` — `splitGrossForWooRest`, `buildEuB2cWooShippingTaxes`
- `src/lib/eu-vat-rates.ts` — `WOO_STANDARD_TAX_RATE_ID_BY_COUNTRY`
