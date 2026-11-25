# WordPress / WPCode snippets (UncutTV)

Snippets run on **wp.uncuttv.at** via [WPCode](https://wpcode.com/). The Next.js app (`uncuttvweb`) creates orders through the WooCommerce REST API; these hooks fix gaps WC cannot express in the payload alone.

| Snippet | File | Status |
|---------|------|--------|
| Reverse Charge — force zero tax | *(existing in WP, not in this repo)* | Production |
| **Preserve explicit shipping tax (REST)** | `uncuttv-preserve-shipping-tax-rest.php` | **Deploy via WPCode** |
| **Videoplattform Anmelde-Endpunkt** | `uncuttv-videoplattform-anmeldung.php` | **Deploy via WPCode** |
| **Videoplattform Geheimnis setzen** | `uncuttv-videoplattform-geheimnis.php` | **Deploy via WPCode** |
| **Kasse: Suche und Sperre je Zahlung** | `uncuttv-kasse.php` | **Deploy via WPCode, vor dem Shop** |

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
  `X-Videoplattform-Secret` exakt dem hinterlegten Geheimnis entspricht
  (`hash_equals`). Quelle in dieser Reihenfolge: Konstante
  `UNCUTTV_VIDEOPLATTFORM_SECRET` aus der `wp-config.php` (hat Vorrang,
  falls Dateizugriff doch möglich wird) — sonst die WordPress-Option
  `uncuttv_videoplattform_secret` (gesetzt über das Snippet
  „Geheimnis setzen", kein Dateizugriff nötig). Ist keins von beiden
  gesetzt: 503. Er ist damit nie öffentlich abfragbar.
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

**Schritt 1 — Geheimnis setzen (ohne Dateizugriff, über WPCode):**

Das Geheimnis wird **nicht von Hand eingetippt** und steht nie im
Snippet-Code — das Setz-Snippet erzeugt es selbst (64 Hex-Zeichen aus
`random_bytes`) und legt es in der Option
`uncuttv_videoplattform_secret` ab (`autoload=no`; nicht per
`register_setting` registriert, also nicht über `/wp/v2/settings` oder
sonst über die REST-API auslesbar):

1. WPCode → Add New → PHP Snippet.
2. **Name:** `UncutTV — Videoplattform Geheimnis setzen`
3. **Code:** aus [`uncuttv-videoplattform-geheimnis.php`](./uncuttv-videoplattform-geheimnis.php).
4. **Location:** Admin Only. Aktivieren.
5. Eine beliebige Admin-Seite laden: Oben erscheint ein Hinweis mit dem
   erzeugten Geheimnis. Den Wert kopieren und auf der Videoplattform
   (Vercel) als `SHOP_AUTH_SECRET` eintragen.
6. Im Hinweis **„Übertragen — nicht mehr anzeigen"** klicken. Danach
   zeigt das Snippet nichts mehr an und überschreibt nie ein
   vorhandenes Geheimnis — es kann gefahrlos aktiv bleiben oder
   deaktiviert werden.
7. **Rotation** bei Bedarf: „Neues Geheimnis erzeugen" im Hinweis
   (erscheint nach Reaktivierung bzw. solange nicht bestätigt) — der
   alte Wert gilt sofort nicht mehr, Vercel muss nachziehen.

*Alternative, falls später doch Dateizugriff besteht:* in der
`wp-config.php` `define('UNCUTTV_VIDEOPLATTFORM_SECRET', '<64 Zeichen
Zufall>')` setzen — die Konstante hat Vorrang vor der Option.

**Schritt 2 — Endpunkt einspielen:**

1. WPCode → Add New → PHP Snippet.
2. **Name:** `UncutTV — Videoplattform Anmelde-Endpunkt`
3. **Code:** aus [`uncuttv-videoplattform-anmeldung.php`](./uncuttv-videoplattform-anmeldung.php)
   (doppeltes `<?php` weglassen, falls WPCode selbst wrappt).
4. **Location:** Run Everywhere.
5. Aktivieren.

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

---

## UncutTV Kasse: Suche und Sperre je Zahlung

Datei: [`uncuttv-kasse.php`](./uncuttv-kasse.php)

### Wozu

Zu einer PayPal-Zahlung entstanden bis zu fünf Bestellungen, weil der Shop
vor dem Anlegen nicht dicht suchen konnte (die REST-Schnittstelle ignoriert
`meta_key` und liefert die neuesten 20 Bestellungen). Das Snippet sucht
direkt in der Datenbank und vergibt je Zahlung eine Sperre mit eindeutigem
Schlüssel: Von zwei gleichzeitigen Aufrufen legt genau einer an.

### Einspielen

**Reihenfolge einhalten: erst das Snippet, dann den Shop deployen.** Der
Shop legt ohne erreichbare Suche keine Bestellung an (Fehler 503).

1. WPCode → alle Snippets exportieren (Sicherung).
2. Code Snippets → Add New → **PHP Snippet**.
3. Name: `UncutTV Kasse: Suche und Sperre`.
4. Inhalt von `uncuttv-kasse.php` einfügen (das führende `<?php` weglassen,
   wenn WPCode es selbst setzt).
5. Location: **Run Everywhere**. Aktivieren.
6. Prüfen (nur lesend, legt beim ersten Aufruf die Tabelle
   `wp_uncuttv_zahlung_sperre` an):
   `GET https://wp.uncuttv.at/wp-json/wc-uncuttv/v1/status` mit Consumer Key
   und Secret des Shops (Basic Auth). Erwartet:
   `{"stand":"1","tabelle":true,"hpos":true,…}`. Mit `?ref=paypal_<Order-ID>`
   einer bekannten Bestellung muss `"suche":{"zustand":"vorhanden",…}` mit
   deren Nummer kommen.
7. Erst danach den Shop deployen.

Die Anmeldung läuft über die WooCommerce-Schlüssel des Shops; der Namensraum
`wc-uncuttv` beginnt dafür absichtlich mit `wc-`. Ein eigenes Geheimnis ist
nicht nötig.

### Ausschalten

- Snippet deaktivieren **und** im Shop `ZAHLUNG_SPERRE=aus` setzen (Vercel,
  danach neu deployen). Ohne die Variable legt der Shop keine Bestellungen
  mehr an, solange das Snippet fehlt.
- Die Tabelle kann stehen bleiben; sie enthält nur Schlüssel, Bestellnummer
  und Zeitpunkt.

### Verhalten in Kürze

| Fall | Antwort |
|------|---------|
| Bestellung zur Zahlung existiert (auch alte, auch stornierte) | `vorhanden` mit Nummer, es wird nichts angelegt |
| Niemand hat die Sperre | `frei` mit Token, der Aufrufer legt an und bestätigt |
| Ein anderer Aufruf legt gerade an | `in_arbeit`, der Shop wartet bis zu 12 s und fragt erneut |
| Sperre liegt länger als 5 Minuten ohne Bestellung | wird übernommen |
| Schlüssel des Kassenvorgangs (`kasse_…`) | zählt nur 24 Stunden |

---

## UncutTV Kasse, Stand 2: Reservierung für Einzelstücke

Dieselbe Datei [`uncuttv-kasse.php`](./uncuttv-kasse.php), unterer Teil. Wer
Stand 1 schon eingespielt hat, ersetzt den Inhalt des Snippets durch die
ganze Datei.

### Wozu

Einzelstücke (Bestand 1) wurden doppelt verkauft: Kunde A hatte das Bild im
Warenkorb, Kunde B kaufte es, A konnte danach trotzdem noch bezahlen. Jetzt
bucht die Kasse beim Klick auf „Jetzt kaufen“ den Bestand ab, bevor die
Zahlung bestätigt wird. Eine einzige bedingte SQL-Anweisung („nur wenn
Bestand ≥ Menge“) entscheidet, wer gewinnt.

### Was gilt

- **Nur** Produkte mit dem Schlagwort `einzelstueck` (Slug) **und**
  eingeschalteter Lagerverwaltung. Alles andere läuft unverändert.
- Reservierung ohne Bestellung läuft nach **15 Minuten** ab, der Bestand
  kommt zurück (Lauf `/api/cron/reservierung-aufraeumen`, alle 5 Minuten).
- Entsteht die Bestellung, übernimmt sie die Reservierung. Die Position
  bekommt das WooCommerce-Kennzeichen `_reduced_stock`: WooCommerce bucht
  nicht ein zweites Mal ab und bucht bei Storno oder Erstattung wie gewohnt
  zurück. In der Bestellung steht dazu eine Notiz.
- **Vorkasse** bindet den Bestand sofort. Frist: Konstante
  `UNCUTTV_RES_VORKASSE_STD` oben im unteren Teil der Datei (Vorgabe 168
  Stunden). Ist die Bestellung dann noch „Zahlung ausstehend“, wird sie
  storniert und der Bestand kommt zurück.
- Ausschalter im Shop: `EINZELSTUECK_RESERVIERUNG=aus` (Vercel, neu
  deployen). Das Snippet kann dabei aktiv bleiben.

### Einspielen

1. In WooCommerce das Schlagwort `einzelstueck` anlegen und den
   Einzelstücken geben; Lagerverwaltung an, Bestand 1.
2. `UNCUTTV_RES_VORKASSE_STD` in der Datei auf die gewünschte Frist setzen.
3. Snippet-Inhalt in WPCode durch die ganze Datei ersetzen, speichern.
4. Prüfen: `GET /wp-json/wc-uncuttv/v1/reservierung/status` (Consumer Key
   und Secret des Shops). Erwartet: `"stand":"2","tabelle":true,
   "schlagwort_da":true,"produkte":<Anzahl>`.
5. Erst danach den Shop deployen.

### Probe mit einem Testprodukt (vor dem Vorverkauf)

Testprodukt mit Schlagwort `einzelstueck`, Lagerverwaltung an, Bestand 1.

| Schritt | Erwartet |
|---------|----------|
| Browser A: Kasse, Karte, „Jetzt kaufen“ mit einer Karte, die abgelehnt wird | Produkt kurz „ausverkauft“, nach der Ablehnung wieder Bestand 1 |
| Browser A und B: beide in der Kasse, B kauft zu Ende | B: Bestellung, Bestand 0, Notiz „war reserviert“; Bestand **nicht** −1 |
| Browser A klickt danach „Jetzt kaufen“ | Meldung „inzwischen ausverkauft“, Artikel fliegt aus dem Warenkorb, keine Zahlung |
| PayPal-Fenster öffnen und schließen | Bestand wieder 1 |
| Reservieren, Tab schließen, 15 bis 20 Minuten warten | Bestand wieder 1 |
| Vorkasse bestellen | Bestand 0, Bestellung „Zahlung ausstehend“ |
| Diese Bestellung stornieren | Bestand wieder 1 |
| Bezahlte Bestellung stornieren | Bestand wieder 1 (WooCommerce bucht zurück) |
| Gemischter Warenkorb (Einzelstück + normaler Artikel) kaufen | Einzelstück 0, normaler Artikel um die Menge reduziert, nichts doppelt |

### Grenzen dieser kleinsten Variante

- Dauert eine Zahlung länger als 15 Minuten (Klarna), ist die Reservierung
  abgelaufen; kauft in der Zwischenzeit jemand anderes, entsteht doch ein
  Doppelverkauf. Der Bestand steht dann auf −1 und zeigt es an.
- Die Kasse von WordPress selbst und Änderungen im Admin reservieren nicht.
- Die Ausweitung auf alle Produkte mit Lagerverwaltung kommt mit dem Umbau
  der Kasse (Phase 2b).
