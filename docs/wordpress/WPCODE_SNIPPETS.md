# WordPress / WPCode snippets (UncutTV)

Snippets run on **wp.uncuttv.at** via [WPCode](https://wpcode.com/). The Next.js app (`uncuttvweb`) creates orders through the WooCommerce REST API; these hooks fix gaps WC cannot express in the payload alone.

| Snippet | File | Status |
|---------|------|--------|
| Reverse Charge — force zero tax | *(existing in WP, not in this repo)* | Production |
| **Preserve explicit shipping tax (REST)** | `uncuttv-preserve-shipping-tax-rest.php` | **Deploy via WPCode** |
| **Videoplattform Anmelde-Endpunkt** | `uncuttv-videoplattform-anmeldung.php` | **Deploy via WPCode** |

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

### WC-Version-Kompatibilität

- **WC 10.x:** nutzt `set_props(['total_tax' => ...])`, weil `set_total_tax()` und `set_taxes()` in dieser Version `protected` sind (Fatal Error bei Direct-Calls).
- Bei WC-Updates auf zukünftige Major-Versionen: prüfen, ob `set_props()` weiterhin als public API existiert (Teil der `WC_Data`-Basisklasse, sollte stabil bleiben).

### Vorherige Versuche (nicht funktioniert)

- **v1** (`set_total_tax()` / `set_taxes()` direkt): Fatal Error `Call to protected method WC_Order_Item_Shipping::set_total_tax() from global scope` (WC 10.7).
- **v2** (`calculate_totals(false)` nach `set_props`): Shipping-Tax und Tax-Zeilen korrekt, aber `order->total` blieb 1 ct zu niedrig (z. B. Order #4908: €44,69 statt €44,70). PDF nutzt gespeichertes Total → Versand dort noch €7,79.

### Rollback

Deactivate the WPCode snippet. No DB migration. Next.js `taxes[]` on shipping lines can stay (harmless); the hook is the authoritative fix.

### REST meta keys (WPCode snippet #39)

Add to the `is_protected_meta` allowlist on **wp.uncuttv.at** when baking coupons:

- `_uncuttv_applied_coupon`
- `_uncuttv_applied_coupon_discount_eur`

### Related code (uncuttvweb)

- `src/lib/wc-order-from-payment.ts` — Stripe → WC order
- `src/app/api/create-bank-order/route.ts` — bank transfer
- `src/lib/woo-vat-split.ts` — `splitGrossForWooRest`, `buildEuB2cWooShippingTaxes`
- `src/lib/eu-vat-rates.ts` — `WOO_STANDARD_TAX_RATE_ID_BY_COUNTRY`

---

## UncutTV — Videoplattform Anmelde-Endpunkt

### Zweck

Die Videoplattform (Repo `uncuttv-videoplattform`, eigenes
Next.js-Projekt) lässt Kunden sich mit ihrem **bestehenden Shop-Konto**
anmelden. Dafür stellt WordPress einen Endpunkt bereit, der Zugangsdaten
prüft und bei Erfolg nur die Eckdaten zurückgibt — unveränderliche
Kennung (WP-User-ID), Anzeigename, E-Mail. Kein Passwort, keine
Bestelldaten. Die Plattform ruft ihn ausschließlich
**Server-zu-Server** auf; aus dem Browser kommt hier nie etwas an.

```
POST /wp-json/uncuttv/v1/videoplattform/anmeldung
Header: X-Videoplattform-Secret: <gemeinsames Geheimnis>
Body:   { "email": "...", "passwort": "..." }

200 → { "kennung": 123, "anzeigename": "…", "email": "…" }
401 → { "fehler": "ungueltig" }          (falsches Passwort, unbekanntes
                                          ODER gesperrtes Konto — bewusst
                                          nicht unterscheidbar)
429 → { "fehler": "zu_viele_versuche" }  (+ Retry-After: 900)
```

### Absicherung

- **Gemeinsames Geheimnis:** Der Endpunkt antwortet nur, wenn der Header
  `X-Videoplattform-Secret` exakt der Konstante
  `UNCUTTV_VIDEOPLATTFORM_SECRET` entspricht (`hash_equals`). Ohne
  Konfiguration: 503. Er ist damit nie öffentlich abfragbar.
- **Drosselung:** Fehlversuchszähler je Konto und je Absender-IP
  (Transients, 15-Minuten-Fenster; Limits 10 je Konto / 30 je IP,
  darüber 429 mit Retry-After), ab dem dritten Fehlschlag zunehmende
  Verzögerung bis 2 s.
- **Kein Konten-Orakel:** Für unbekannte E-Mail-Adressen läuft dieselbe
  bcrypt-Rechenarbeit wie eine echte Passwortprüfung, und die Antwort
  ist identisch zu „falsches Passwort".
- **Gesperrte Konten:** Die Prüfung läuft über `wp_authenticate`, damit
  Sperren aus Sicherheits-Plugins greifen; zusätzlich blockt
  `user_status != 0`.

### Install

1. **wp-config.php** auf wp.uncuttv.at ergänzen (Geheimnis erzeugen,
   z. B. `openssl rand -hex 32`):
   ```php
   define('UNCUTTV_VIDEOPLATTFORM_SECRET', '<64 Zeichen Zufall>');
   ```
   Dasselbe Geheimnis kommt auf der Videoplattform (Vercel) in die
   Umgebungsvariable `SHOP_AUTH_SECRET`.
2. WPCode → Add New → PHP Snippet.
3. **Name:** `UncutTV — Videoplattform Anmelde-Endpunkt`
4. **Code:** aus [`uncuttv-videoplattform-anmeldung.php`](./uncuttv-videoplattform-anmeldung.php)
   (doppeltes `<?php` weglassen, falls WPCode selbst wrappt).
5. **Location:** Run Everywhere.
6. Aktivieren.

### Testplan

```bash
# Ohne bzw. mit falschem Geheimnis → 401 (kein_zugriff):
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://wp.uncuttv.at/wp-json/uncuttv/v1/videoplattform/anmeldung \
  -H 'Content-Type: application/json' -d '{"email":"x@y.z","passwort":"a"}'
```

- Mit Geheimnis + echten Testkonto-Daten → 200 mit
  `kennung`/`anzeigename`/`email`.
- Mit Geheimnis + falschem Passwort → 401 `{"fehler":"ungueltig"}`.
- Mit Geheimnis + nicht existierender E-Mail → 401, **gleiche Antwort**.
- 10 Fehlversuche auf ein Konto → 429 mit `Retry-After: 900`.

### Rollback

Snippet deaktivieren. Keine DB-Änderung. Die Videoplattform zeigt dann
bei Anmeldeversuchen einen Fehler; bestehende Plattform-Sitzungen
laufen weiter.

### Related code (uncuttv-videoplattform)

- `src/lib/shopAnmeldung.ts` — Server-seitiger Aufruf dieses Endpunkts
- `src/app/anmelden/` — Anmeldeseite der Plattform
