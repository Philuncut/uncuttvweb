# Versand-/OSS-Diagnose: Alle Länderbezüge im Repo

**Zweck:** Vollständige Karte aller Stellen, an denen ein Land eine Rolle spielt — als Vorbereitung darauf,
den Versand in alle EU-Länder **außer Deutschland** zu deaktivieren. Nicht-EU-Ziele (GB, CH, JP, …)
bleiben unverändert. **Reine Diagnose, keine Änderung.**

Stand: 2026-08-10. Alle Pfade relativ zum Repo-Root `uncuttvweb`. Zeilennummern beziehen sich auf den
Stand dieses Datums.

---

## 1. Datenfluss-Überblick: Vom Checkout bis zur Rechnung

### Wer entscheidet was

| Instanz | Entscheidet |
|---|---|
| **Next.js-Frontend/-API** | Welche Länder wählbar sind, welcher **Steuerpfad** gilt (B2C brutto / Wholesale netto+USt / Reverse Charge / Drittland-Export), alle Steuer**beträge** (Netto/Steuer-Split pro Position), Wholesale-Versandpauschale, Sperr- und EU-Listen |
| **WooCommerce (WP-DB)** | Welche Länder eine **Versandzone** haben und was der Versand **kostet** (inkl. Free-Shipping-Schwelle), Bundesland-Listen, Steuersatz-Tabellen (IDs) |
| **WPCode-Snippets in WP** | Erzwingen 0 % Steuer, wenn das Frontend die Meta-Flags `_uncuttv_reverse_charge` bzw. `_uncuttv_third_country` gesetzt hat — **ohne eigene Länderprüfung** |
| **PDF-Plugin (WP)** | Rendert die Rechnung aus den gespeicherten Order-Beträgen; einzige Länderlogik dort ist die Rabatt-Darstellung für EU-B2C |

### Ablauf einer Bestellung

1. **Länderwahl:** Das Checkout-Formular hat **ein einziges Länderfeld**, Default `"AT"`
   ([src/components/CheckoutForm.tsx:1252](../src/components/CheckoutForm.tsx)); Dropdown-Quelle ist
   `getWorldCountriesForDropdown()` (alle ISO-Codes minus Sperrliste,
   [src/lib/world-countries.ts:9–29](../src/lib/world-countries.ts)). Bei eingeloggten Kunden wird das Land
   aus dem Woo-Profil vorbefüllt (CheckoutForm.tsx:1396, 1416). **Keine Geolocation, keine IP-Vorauswahl**
   (nirgends im Repo; `src/middleware.ts` enthält nur den Wholesale-Redirect, Zeilen 28–48).
2. **Versandkosten:** `POST /api/shipping-rate` simuliert einen Warenkorb über die **Woo Store API**
   (`/cart/add-item` → `/cart/update-customer` mit dem Land → `/cart`)
   ([src/app/api/shipping-rate/route.ts:124–158](../src/app/api/shipping-rate/route.ts)). Die Zonen/Preise
   kommen also **zur Laufzeit aus der WP-DB**. Wholesale bekommt vorher pauschal 10 € netto, ohne Zonen-Abfrage
   (route.ts:246–265).
3. **Steuerpfad-Entscheidung (rein im Frontend/Next-API):**
   - Reverse Charge: `isReverseChargeEligible({isWholesale, vat, shippingCountry: country})`
     ([src/lib/reverse-charge.ts:39–62](../src/lib/reverse-charge.ts), Aufruf CheckoutForm.tsx:1912–1919)
   - EU-B2C ≠ AT: `shouldSendExplicitEuB2cLineAmounts()` ([src/lib/eu-vat-rates.ts:87–91](../src/lib/eu-vat-rates.ts))
   - Drittland-B2C: `shouldSendExplicitNonEuLineAmounts()` (eu-vat-rates.ts:97–102)
4. **Zahlung:** `POST /api/create-payment-intent` prüft Sperrliste + Wholesale-EU-Liste
   ([src/app/api/create-payment-intent/route.ts:63–87](../src/app/api/create-payment-intent/route.ts)) und
   schreibt `shipping_country`, `is_wholesale`, `is_reverse_charge` in die Stripe-PI-Metadata (route.ts:175–179).
   PayPal-Bestellungen werden nur mit Betrag angelegt (CheckoutForm.tsx:970–987), die Adresse kommt später aus
   dem Formular.
5. **Woo-Order-Anlage:** über `POST /api/sync-order` (Karte/Klarna/PayPal) bzw. `POST /api/create-bank-order`
   (Vorkasse), beide münden in dieselbe Logik: `taxCountry = billing.country || shipping.country`
   ([src/lib/wc-order-from-payment.ts:457](../src/lib/wc-order-from-payment.ts),
   [src/app/api/create-bank-order/route.ts:194](../src/app/api/create-bank-order/route.ts)). Die Line-Items
   werden je nach Pfad mit **fertig gerechnetem** Netto/Steuer-Split an `POST /wp-json/wc/v3/orders`
   geschickt (wc-order-from-payment.ts:539–586, 619–665). Meta-Flags: `_uncuttv_reverse_charge`,
   `_uncuttv_third_country`, `_uncuttv_tax_free_export`, `_billing_vat`, `_eu_vat_guard_order_vat_number`
   (wc-order-from-payment.ts:112–119, 166–199).
6. **WP-Seite:** WPCode-Snippet 43 („Force Zero Tax on Reverse Charge Orders") und 44 („… Third Country")
   nullen alle Steuern, wenn das jeweilige Meta-Flag `"yes"` ist — **einzige Bedingung ist das Flag, keine
   Länderprüfung** (`uncuttv.code-snippets.json`, Snippet 43 Codezeilen 14–15, Snippet 44 Codezeile 3).
   Snippet „uncuttv_preserve_shipping_tax" verhindert 1-Cent-Drift bei explizit gesetzter Versandsteuer
   ([docs/wordpress/uncuttv-preserve-shipping-tax-rest.php:21](wordpress/uncuttv-preserve-shipping-tax-rest.php)).
7. **Rechnung (PDF):** WooCommerce-PDF-Plugin mit Template „Simple Premium". Die Templates enthalten
   **keinen** Reverse-Charge-Textblock und keine explizite Länderausgabe — das Land erscheint nur im
   Adressblock (`Simple Premium/invoice.php:48, 61`). Einzige Länderlogik im PDF-Layer: die
   Rabatt-Darstellung für EU-B2C-Bestellungen mit eingebackenem Coupon prüft das **Rechnungsland** gegen
   eine eigene 26er-EU-Liste ([docs/wordpress/uncuttv-pdf-baked-coupon-display.php:26–32, 56–57](wordpress/uncuttv-pdf-baked-coupon-display.php)).

### Rechnungsland vs. Lieferland

Im Formular-Checkout existiert nur **ein** Länderfeld; Billing und Shipping werden identisch gesetzt
(wc-order-from-payment.ts:793–804: `shipping: { ...billing }`; sync-order/route.ts:329;
create-bank-order/route.ts:178–260). Nur der Stripe-Fallback-Pfad (ohne Client-Kontext) unterscheidet:
PI-Shipping-Adresse → Billing-Details → PI-Metadata `shipping_country`
(wc-order-from-payment.ts:806–833). Faktisch sind Rechnungs- und Lieferland heute immer gleich.

---

## 2. Wo werden versandfähige Länder festgelegt?

### (a) Im Repo hartkodiert

| Liste | Datei:Zeile | Inhalt (Format) |
|---|---|---|
| Sperrliste (alle Flows) | [src/lib/blocked-countries.ts:7–37](../src/lib/blocked-countries.ts) | ISO-2, 26 Codes: `AF BY BI CF CD CU ER GW HT IR IQ LB LY ML MM NI KP RU SO SS SD SY VE YE ZW` + `US` („Geschäftsentscheidung") |
| Dropdown-Ausschluss | [src/lib/world-countries.ts:7](../src/lib/world-countries.ts) | ISO-2: `AQ BV HM TF UM` (unbewohnte Gebiete) |
| Dropdown-Priorität | world-countries.ts:4 | ISO-2: `AT DE CH` (oben in der Liste) |
| ISO-Grundmenge | [src/lib/iso-3166-1-alpha2-codes.ts:5–8](../src/lib/iso-3166-1-alpha2-codes.ts) | 249 ISO-2-Codes als kommaseparierter String |
| **Ergebnis Checkout-Dropdown** | world-countries.ts:9–29 | 249 − 26 − 5 = **218 wählbare Länder**, deutsche Namen via `Intl.DisplayNames(["de"])` — **kein EU-/Versand-Filter** |
| Wholesale erlaubt | [src/lib/wholesale-allowed-countries.ts:2–30](../src/lib/wholesale-allowed-countries.ts) | ISO-2, EU-27: `AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK` |
| Reverse-Charge-fähig | [src/lib/reverse-charge.ts:4–31](../src/lib/reverse-charge.ts) | ISO-2, EU-27 ohne AT (26 Codes, `GR` mit UID-Präfix-Sonderfall `EL`, Zeile 56) |
| EU-USt-Sätze (= „EU ja/nein" für B2C) | [src/lib/eu-vat-rates.ts:6–34](../src/lib/eu-vat-rates.ts) | ISO-2 → Prozent, 27 Einträge: AT 20, BE 21, BG 20, CY 19, CZ 21, DE 19, DK 25, EE 22, ES 21, FI 25.5, FR 20, GR 24, HR 25, HU 27, IE 23, IT 22, LT 21, LU 17, LV 21, MT 18, NL 21, PL 23, PT 23, RO 19, SE 25, SI 22, SK 23 |
| Woo-Steuersatz-IDs (Spiegel der WP-Tabelle) | eu-vat-rates.ts:46–75 | ISO-2 → Woo `taxes[].id` 1–27, Kommentar Zeile 41–45: „Update manually when rates are recreated in WooCommerce" |
| Mehrfach-Versandarten nur | [src/app/api/shipping-rate/route.ts:6](../src/app/api/shipping-rate/route.ts) | ISO-2: `AT DE` (`B2C_MULTI_SHIP_COUNTRIES`) |
| GLS-Filter nur | [src/lib/filter-de-at-shipping-rates.ts:18](../src/lib/filter-de-at-shipping-rates.ts) | ISO-2: `AT DE` |
| Free-Shipping-Hinweis nur | [src/lib/free-shipping-suggestion.ts:4](../src/lib/free-shipping-suggestion.ts) | ISO-2: `DE AT`; Schwelle 100 € hartkodiert (Zeile 2, Kommentar: „keep in sync with WooCommerce zones") |
| **Legacy** Stripe-Checkout-Session | [src/app/api/checkout/route.ts:45](../src/app/api/checkout/route.ts) | ISO-2: `allowed_countries: ["AT", "DE", "CH"]` — **kein Aufrufer im Repo gefunden (toter Code)** |
| Händler-Dashboard-Adressen | [src/components/HaendlerDashboard.tsx:795–797, 843–845](../src/components/HaendlerDashboard.tsx) | Klarnamen deutsch + ISO-2-Value: nur `AT` Österreich, `DE` Deutschland, `CH` Schweiz — **CH steht im Widerspruch zur Wholesale-EU-Liste** |
| UID-Format-Muster | [src/lib/vat-format.ts:16–25](../src/lib/vat-format.ts) | Präfixe: `CHE AT DE IT FR NL BE ES` (nur 8) |
| PDF-Coupon-Anzeige (WP-Kopie) | [docs/wordpress/uncuttv-pdf-baked-coupon-display.php:29–31](wordpress/uncuttv-pdf-baked-coupon-display.php) | ISO-2, EU-27 ohne AT (26 Codes) — eigene Kopie, muss zu `eu-vat-rates.ts` passen (Kommentar Zeile 22) |
| Meta-CAPI-Vorwahlen | [src/lib/meta-capi-phone.ts:1–32](../src/lib/meta-capi-phone.ts) | ISO-2 → Telefonvorwahl, 29 Länder (nur Telefon-Normalisierung) |

### (b) Zur Laufzeit aus dem WP-/Woo-Backend

- **Versandzonen, Versandmethoden, Preise, Free-Shipping-Schwelle:** ausschließlich über die Woo Store API
  abgefragt ([src/app/api/shipping-rate/route.ts:124–214](../src/app/api/shipping-rate/route.ts)). Das Repo
  enthält **keine** Zonendefinition.
- **Bundesländer/Provinzen pro Land:** `GET /api/woo-states/{country}` → Woo
  `GET /wc/v3/data/countries/{code}` ([src/app/api/woo-states/[country]/route.ts:50–121](../src/app/api/woo-states/%5Bcountry%5D/route.ts)),
  24 h gecacht. Fehlt eine Provinzwahl bei Ländern mit Provinzen (IT, ES, …), wird der Versand blockiert
  (CheckoutForm.tsx:1723–1738).

### (c) Ausschließlich in WP-DB/Admin gepflegt (hier nicht sichtbar)

- Versandzonen und Zonenzuordnung der Länder, Staffeln, Free-Shipping-Regeln — **nicht im Repo gefunden;
  WP-Admin → WooCommerce → Versand.** Nur Testwerte dokumentiert: AT/Post.at 5,38 €, DE/GLS 7,80 €,
  IT/GLS 13,90 €, Wholesale 10,00 € ([docs/wordpress/WPCODE_SNIPPETS.md:50–55](wordpress/WPCODE_SNIPPETS.md)).
- Woo-Einstellung „Verkaufe an / Liefere nach" (General → Selling/Shipping locations) — nicht im Repo.
- Woo-Steuertabellen (Standardsätze, IDs 1–27) — nur der ID-Spiegel liegt im Repo (eu-vat-rates.ts:46–75).
- Konfiguration des Plugins „EU VAT Guard" (die Meta-Keys `_eu_vat_guard_*` deuten darauf hin,
  wc-order-from-payment.ts:158–159) — nicht im Repo.
- PDF-Plugin-Einstellungen (Footer, Shop-Adresse, evtl. Hinweistexte) — nicht im Repo
  (`Simple Premium/invoice.php:180–188` rendert nur `$this->footer()` aus den Plugin-Settings).

---

## 3. Versandkostenberechnung

- **Quelle:** Live-Simulation über die Woo Store API pro Adressänderung (debounced 300 ms,
  CheckoutForm.tsx:1752–1891; Abhängigkeiten `country, state, zip, city, street`, Zeilen 1897–1910).
  Gewichts-/Preisstaffeln liegen komplett in den Woo-Zonen (WP-DB).
- **Land ohne Zone:** Store API liefert keine Raten → `{ok: false, reason: "no_zone"}`
  (shipping-rate/route.ts:181–184) → Antwort `rates: [], rate: null, label: "Versand nicht verfügbar",
  source: "no-zone"` (route.ts:292–301). Im Client setzt das `shipNoZone`
  (CheckoutForm.tsx:1803–1815), wodurch `piShippingReady` false bleibt (CheckoutForm.tsx:1922–1930)
  — **es wird kein PaymentIntent erzeugt, die Bestellung ist blockiert.** Kein 0-€-Fallback, keine
  Default-Zone. Fehlertext: `CHECKOUT_ERROR_SHIPPING_BLOCKED`
  ([src/lib/translations.ts:518–521](../src/lib/translations.ts)).
- **Leeres Land:** serverseitiger Fallback auf `"AT"` (shipping-rate/route.ts:146: `country: country || "AT"`).
- **Mehrere Versandarten (GLS/Post) nur für AT/DE** (route.ts:6, 186–197; Client-Gate CheckoutForm.tsx:1828–1831,
  Radiogruppe nur bei `country === "AT" || country === "DE"`, Zeile 3268–3274). Alle anderen Länder bekommen
  genau die günstigste/ausgewählte Rate.
- **Free Shipping:** Schwelle 100 € ist in Woo konfiguriert und im Repo als UI-Konstante dupliziert
  (free-shipping-suggestion.ts:1–2). Der „Noch X € bis Gratisversand"-Hinweis erscheint nur für DE/AT
  (Zeile 4, 12–23); im Warenkorb-Drawer ist das Land hart `"AT"`
  ([src/components/CartDrawer.tsx:363](../src/components/CartDrawer.tsx)).
- **Wholesale:** pauschal 10 € netto, hartkodiert an zwei Stellen — Server
  (shipping-rate/route.ts:4, 246–265, `rate_id "wholesale_flat"`, `taxable: false`) und Client
  (CheckoutForm.tsx:1698–1712, `setShipRate(10)`, `setStripeShipCents(1000)`). **Die Woo-Zonen werden für
  Wholesale gar nicht befragt** — eine Zonen-Änderung wirkt auf Wholesale nicht.

---

## 4. Steuerlogik: Drei Pfade und ihre Länderfelder

Alle Pfade hängen am selben Feld: dem einen Checkout-Länderfeld, das als Billing **und** Shipping in die
Order geht (siehe Abschnitt 1). `taxCountry = billing.country || shipping.country`
(wc-order-from-payment.ts:457; create-bank-order/route.ts:194).

| Pfad | Entscheidung (Datei:Zeile) | Beträge | Woo-Order-Kennzeichen |
|---|---|---|---|
| **B2C AT** | implizit: weder EU-Split noch Drittland (eu-vat-rates.ts:89, 100: `AT` → beide false) | nur `product_id + quantity`, Woo rechnet selbst (wc-order-from-payment.ts:582–586) | keine Sonder-Metas |
| **B2C EU ≠ AT** | `shouldSendExplicitEuB2cLineAmounts()` = Land ∈ `EU_VAT_RATES_PERCENT` (eu-vat-rates.ts:87–91) | Brutto = AT-Katalog, Steueranteil zum Zielland-Satz herausgerechnet ([src/lib/woo-vat-split.ts:28–37, 86–102](../src/lib/woo-vat-split.ts)); Versandsteuer mit Woo-Tax-Rate-ID (woo-vat-split.ts:43–50) + WP-Hook gegen Rundungsdrift | explizite `subtotal_tax/total_tax`, `shipping_lines.taxes[]` |
| **B2C Drittland** | `shouldSendExplicitNonEuLineAmounts()` = Land ∉ EU-Karte und ≠ AT (eu-vat-rates.ts:97–102) | Brutto explizit, Steuer 0,00 (woo-vat-split.ts:155–178); `tax_lines = []` (wc-order-from-payment.ts:605–612) | `_uncuttv_third_country: "yes"`, `_uncuttv_tax_free_export: "yes"` (wc-order-from-payment.ts:191–199) → WP-Snippet 44 nullt Steuern |
| **Wholesale AT / EU ohne RC** | `isWholesale` && nicht RC | Händler-Netto + USt zum **Zielland**-Satz via `addTaxToNet`/`buildWholesaleNonRcLineItem` (woo-vat-split.ts:53–80); **unbekanntes Land → 20 %-Fallback** (woo-vat-split.ts:14–18) | `_uncuttv_is_wholesale` nur im Bank-Pfad (create-bank-order/route.ts:420–425) |
| **Wholesale EU mit UID (RC)** | `isReverseChargeEligible()` (reverse-charge.ts:39–62): Wholesale + UID nicht leer + Land ∈ EU-26-Liste + Land ≠ AT + UID-Präfix = Land + `validateEuVatFormat()` | alle Zeilen 0 % (wc-order-from-payment.ts:542–557), `tax_lines = []` (Zeile 605–606) | `_uncuttv_reverse_charge: "yes"`, `_eu_vat_guard_order_vat_exempt: "yes"` (Zeile 180–189) → WP-Snippet 43 nullt Steuern |

Weitere Fundstellen:

- **PI-Betrag** (Stripe): Wholesale ohne RC wird der Netto-Warenkorb mit dem Zielland-Satz aufbrutto­t —
  `getVatRateForCountry(taxCountry) ?? 20`
  ([src/lib/compute-payment-intent-amount.ts:61–75, 114–119](../src/lib/compute-payment-intent-amount.ts)).
- **Coupon-Verrechnung ist länderabhängig:** außerhalb von AT wird der Rabatt in die Line-Items
  „eingebacken" statt als `coupon_lines` gesendet
  ([src/lib/woo-coupon-line-discount.ts:56–59, 83–103](../src/lib/woo-coupon-line-discount.ts)).
- **UID-Formatprüfung deckt nur 8 Länder ab** (vat-format.ts:16–25: CHE, AT, DE, IT, FR, NL, BE, ES).
  Kombiniert mit reverse-charge.ts:59 heißt das: **RC ist de facto nur für DE, IT, FR, NL, BE, ES erreichbar**
  — UIDs aus PL, CZ, SE, DK usw. fallen durch die Formatprüfung. Keine VIES-Abfrage im Repo
  (vat-format.ts:2 „no VIES"); die Meta-Keys `_uncuttv_vies_*` sind vorgesehen, werden aber nirgends
  geschrieben (wc-order-from-payment.ts:115–118).
- **Wo liegen die Steuersätze?** Doppelt: im Code (`EU_VAT_RATES_PERCENT`, eu-vat-rates.ts:6–34) für die
  Betragsrechnung, und in den Woo-Steuertabellen (WP-Admin) für Woo-interne Zwecke; die Zuordnung läuft über
  den manuell gepflegten ID-Spiegel (eu-vat-rates.ts:46–75).
- **„EU ja/nein" wird über vier verschiedene Listen entschieden** — siehe Abschnitt 7.

---

## 5. OSS

- **Ein explizites OSS-Kennzeichen existiert nirgends im Repo.** Volltextsuche nach `oss` / `one-stop`
  in Code, Docs, Snippets: kein Treffer (geprüft in `src/`, `docs/`, `uncuttv.code-snippets.json`,
  `Simple Premium/`).
- OSS-relevant sind die **EU-B2C-≠-AT-Bestellungen**: Sie tragen den Zielland-Steueranteil in
  `subtotal_tax`/`total_tax` der Line-Items und in `shipping_lines.taxes[]` mit der Woo-Tax-Rate-ID des
  Ziellands (woo-vat-split.ts:43–50; wc-order-from-payment.ts:643–647). **Die OSS-Auswertung selbst
  (Meldung, Summen pro Land) ist nicht im Repo gefunden — vermutlich WP-Admin/DB** (Woo-Steuerberichte über
  die Steuertabellen-IDs) oder manuell aus den Bestelldaten.
- Felder, die pro Bestellung entstehen und für OSS/Buchhaltung relevant sind:
  - `billing.country` / `shipping.country` (identisch, Abschnitt 1)
  - Steuer-Splits pro Position und Versand (Abschnitt 4)
  - Meta: `_uncuttv_reverse_charge`, `_uncuttv_third_country`, `_uncuttv_tax_free_export`,
    `_billing_vat`, `_eu_vat_guard_order_vat_number`, `_eu_vat_guard_order_vat_exempt`
    (wc-order-from-payment.ts:112–119, 166–199; REST-Freischaltung: Snippet 39 in
    `uncuttv.code-snippets.json`, Codezeilen 7–12)
  - `_uncuttv_is_wholesale`, `_uncuttv_payment_method`, `_uncuttv_locale` nur im Bank-Pfad
    (create-bank-order/route.ts:411–430)
- **Auswertungen/Exporte, die eine EU-Länderliste voraussetzen:** Im Repo existiert kein Report und kein
  Export (kein CSV, kein Feed — Abschnitt 6). Die einzige EU-Liste, die beim „Verschwinden" von Ländern
  auf WP-Seite bricht, ist die PDF-Coupon-Anzeige (uncuttv-pdf-baked-coupon-display.php:26–32) — sie prüft
  aber nur pro Bestellung das Rechnungsland und bricht nicht, wenn Länder keine Bestellungen mehr liefern.
  **Wichtig:** Bereits gebuchte OSS-Umsätze hängen an den Woo-Steuertabellen — diese dürfen beim
  Versand-Rückbau **nicht** gelöscht werden, sonst stimmen historische Reports/IDs nicht mehr
  (eu-vat-rates.ts:41–45 warnt explizit vor ID-Verschiebung).

---

## 6. Weitere Stellen mit Länderbezug

### Checkout-Dropdown / Adressformular / Adressvalidierung
- Dropdown: CheckoutForm.tsx:1452–1459 (Quelle `world-countries.ts`), Render Zeile 3240–3251.
  Konto-Profil nutzt dieselbe Quelle ([src/lib/countries.ts:9–13](../src/lib/countries.ts),
  [src/components/AccountProfileForm.tsx:10, 176](../src/components/AccountProfileForm.tsx)).
- Ungültiges/gesperrtes Land im Profil → stiller Fallback auf `"AT"` (CheckoutForm.tsx:1466–1471;
  AccountProfileForm.tsx:105, 119).
- **Keine PLZ-Validierung** (weder Format noch Länge, kein länderabhängiges Muster — nirgends im Repo;
  Freitextfeld CheckoutForm.tsx:3199–3203). Einzige länderabhängige Feld-Validierung ist die UID
  (vat-format.ts).
- Provinzpflicht länderabhängig über Woo (Abschnitt 2b).
- Händler-Anfrageformular: Land und UID sind **freie Textfelder ohne Validierung**
  ([src/app/haendler/anfrage/page.tsx:185–208](../src/app/haendler/anfrage/page.tsx);
  Server prüft nur Nicht-Leerheit, [src/app/api/haendler/anfrage/route.ts:39–44](../src/app/api/haendler/anfrage/route.ts)).

### Geolocation / IP-Vorauswahl
- **Nicht im Repo gefunden.** Kein `x-vercel-ip-country`, kein GeoIP, kein `Accept-Language`-Mapping.
  Länder-Default ist statisch `"AT"` (Fundstellen in Abschnitt 1 und 3). Sprache (de/en) kommt aus
  localStorage, nicht aus dem Land ([src/lib/LanguageContext.tsx:22–33](../src/lib/LanguageContext.tsx)).

### Währung / Preisdarstellung
- Fix EUR, Format fix `de-DE` ([src/lib/format-price.ts:1–8](../src/lib/format-price.ts)) — **kein Länderbezug.**

### Stripe
- Keine `allowed_countries`-Konfiguration im aktiven Code; [src/lib/stripe.ts](../src/lib/stripe.ts) ist nur
  Client-Init. Länder-Gates liegen in den PI-Routen (create-payment-intent/route.ts:63–87;
  [src/app/api/update-payment-intent/route.ts:66–90](../src/app/api/update-payment-intent/route.ts)).
- **Ausnahme (toter Code):** Legacy-Route `/api/checkout` mit `allowed_countries: ["AT","DE","CH"]`
  (checkout/route.ts:45) — kein Aufrufer gefunden.
- Zahlarten `card | bank | paypal | klarna | eps` (CheckoutForm.tsx:163) werden **nicht** nach Land
  gefiltert — welche Methoden Stripe je Land anbietet, entscheidet Stripe (Dashboard/automatic payment
  methods, create-payment-intent/route.ts:166).

### PayPal
- Script-Optionen: `currency: "EUR"`, `locale: de_DE/en_US`, keine Länderrestriktion
  (CheckoutForm.tsx:933–945). Die PayPal-Order wird nur mit Betrag angelegt (Zeile 970–987);
  Woo-Order danach über `/api/sync-order` mit den Formulardaten. Länderprüfung greift also erst dort
  (blocked + wholesale-EU, wc-order-from-payment.ts:459–475) — **eine Zonen-Prüfung findet bei der
  Order-Anlage nicht statt** (siehe Abschnitt 7).
- Recovery: fehlgeschlagene Syncs werden clientseitig gespeichert und beim nächsten App-Load unverändert
  erneut gegen `/api/sync-order` gespielt
  ([src/lib/retry-pending-paypal-recoveries.ts:42–48](../src/lib/retry-pending-paypal-recoveries.ts)).
- Supabase-Tabelle `paypal_orphan_orders` enthält **keine** Länder-/Adressfelder
  (supabase/migrations/20260527120000_paypal_orphan_orders.sql:4–19).

### Rechnungs-PDF inkl. Reverse-Charge-Textblock
- **Es gibt keinen Reverse-Charge-Textblock in den PDF-Templates** — weder in `Simple Premium/*.php` noch
  in den Kopien unter `docs/wordpress/`. Kein „Steuerschuldnerschaft des Leistungsempfängers", kein
  „innergemeinschaftliche Lieferung", keine Kunden-UID-Ausgabe in den Templates. Falls die Rechnung heute
  einen solchen Text zeigt, kommt er aus den Plugin-Einstellungen (Footer/Notes) in WP — **nicht im Repo
  gefunden — vermutlich WP-Admin** (Hook-Punkte: `Simple Premium/invoice.php:156–188`).
- USt-Zeile im PDF: Totals-Typ `vat` (`Simple Premium/template-functions.php:81–83`); Lieferschein/Packzettel
  ohne Preise (template-functions.php:17–36).
- Händler-Rechnung (separates Next-PDF): fixe 20 %-USt-Annahme, UID aus Meta `uid_nummer`
  ([docs/PROJECT_AUDIT.md:163, 170](PROJECT_AUDIT.md);
  [src/app/api/haendler/invoice/route.ts](../src/app/api/haendler/invoice/route.ts)) — **stimmt für
  RC-Bestellungen (0 %) und Wholesale-EU-Bestellungen (Zielland-Satz) nicht.**

### Händler-Portal
- **Kein eigener Bestell-/Versandflow** — gemeinsamer Warenkorb und dieselbe `CheckoutForm`
  (`isWholesale` aus der Session, CheckoutForm.tsx:1358; Middleware leitet Wholesale nur von `/shop` weg,
  src/middleware.ts:28–53, `/checkout` ist frei).
- UID wird an zwei Stellen unterschiedlich gespeichert: Checkout → Order-Meta `_billing_vat` +
  `_eu_vat_guard_order_vat_number` ([src/lib/checkout-order-extras.ts:26–31](../src/lib/checkout-order-extras.ts));
  Händler-Dashboard → Customer-Meta `uid_nummer` (HaendlerDashboard.tsx:521).
- Dashboard-Länderauswahl nur AT/DE/CH (HaendlerDashboard.tsx:795–797, 843–845).

### Google-Merchant-Feed / Ads-Zielländer
- **Nicht im Repo gefunden.** Keine Feed-Generierung, keine `g:`-Elemente, keine Ads-Conversion-IDs.
  Nur GA4 ([src/components/GoogleAnalytics.tsx](../src/components/GoogleAnalytics.tsx)) und Sitemap
  (src/app/sitemap.ts). Merchant Center/Ads werden extern gepflegt.

### Transaktionsmails und Newsletter
- Bestellbestätigung (Kunde + intern): Land als letzte Adresszeile, roher ISO-Code
  ([src/lib/order-confirmation-email.ts:309–322, 438–439, 539–540](../src/lib/order-confirmation-email.ts)).
  Keine Steuertexte.
- **Wholesale-Office-Mail ist die einzige Mail mit Steuer-/RC-Texten:** Pipeline
  `wholesale_at | wholesale_eu_rc | wholesale_eu_vat` aus dem Lieferland
  ([src/lib/notify-wholesale-order.ts:98–110](../src/lib/notify-wholesale-order.ts)), Texte
  „Steuerschuldnerschaft des Leistungsempfängers gem. Art. 196 MwStSystRL" (Zeile 207–211, 361–364),
  Banner „Wholesale EU — ausgewiesene MwSt (Zielland)" (Zeile 285–303).
- Abandoned-Cart-, Wholesale-Reminder-, YouTube-Coupon- und Newsletter-Mails: **kein Empfängerland**,
  nur statischer Absender „6094 Axams · Austria" + `ATU 81526957`
  (abandoned-cart-templates.ts:147–148; wholesale-reminder-templates.ts:92–93;
  youtube-coupon-mail-template.ts:78; newsletter/subscribe/route.ts:70).
- Meta CAPI erhält das Land (gehasht) aus Checkout und Woo-Order
  ([src/lib/meta-capi.ts:66](../src/lib/meta-capi.ts), meta-capi-purchase.ts:91–102,
  CheckoutForm.tsx:1291) — rein Marketing, keine Steuerwirkung.

### Schnittstelle zur Versandabwicklung (SendDrop / Ventrha)
- **Nicht in diesem Repo.** Keine Fulfillment-/Tracking-/Label-API. Verweise in
  `.claude/settings.local.json` (Zeilen 39–73) zeigen auf ein separates Repo
  `D:/UncutTV/Website/uncuttv-versand` (u. a. `src/main/shipping/adapters/senddrop-adapter.ts`) und
  `%APPDATA%/VENTRHA/uncuttv-shipping-settings.json`. **Dort muss die Länderliste separat geprüft werden.**

---

## 7. Kopplungen und Risiken

### Dieselbe Information liegt mehrfach vor

| Information | Single Source of Truth (faktisch) | Duplikate |
|---|---|---|
| „Ist Land EU?" (B2C-Steuerpfad) | `EU_VAT_RATES_PERCENT` (eu-vat-rates.ts:6–34) | `EU_REVERSE_CHARGE_COUNTRIES` (reverse-charge.ts:4–31), `WHOLESALE_ALLOWED_COUNTRY_CODES` (wholesale-allowed-countries.ts:2–30), PHP-Liste im PDF-Snippet (uncuttv-pdf-baked-coupon-display.php:29–31), Woo-Steuertabellen (WP-DB) |
| Woo-Steuersatz-IDs | Woo-Steuertabelle (WP-DB) | Spiegel `WOO_STANDARD_TAX_RATE_ID_BY_COUNTRY` (eu-vat-rates.ts:46–75) — bricht still, wenn WP-Sätze neu angelegt werden |
| Free-Shipping-Schwelle 100 € | Woo-Zone (WP-DB) | Konstante `FREE_SHIPPING_THRESHOLD_EUR` (free-shipping-suggestion.ts:2) |
| Wholesale-Versand 10 € | — (zweifach hartkodiert) | Server shipping-rate/route.ts:4 und Client CheckoutForm.tsx:1701, 1711 |
| AT/DE-Sonderbehandlung | — (dreifach) | `B2C_MULTI_SHIP_COUNTRIES` (shipping-rate/route.ts:6), `filter-de-at-shipping-rates.ts:18`, `SUGGESTION_COUNTRIES` (free-shipping-suggestion.ts:4), plus Inline-Checks CheckoutForm.tsx:1831, 3270 |
| UID des Kunden | — (zwei Schreibwege) | Order-Meta `_billing_vat` (checkout-order-extras.ts:28) vs. Customer-Meta `uid_nummer` (HaendlerDashboard.tsx:521) |

### Was bricht, wenn Land aus Liste X entfernt wird, aber in Y bleibt?

1. **Gefährlichste Kopplung — Steuerpfad kippt:** Die EU-Erkennung für B2C hängt an
   `EU_VAT_RATES_PERCENT`. Würde man den EU-Versand „deaktivieren", indem man Länder aus
   **eu-vat-rates.ts** entfernt, würden diese Länder sofort als **Drittland** klassifiziert
   (`shouldSendExplicitNonEuLineAmounts` → 0 % USt + `_uncuttv_tax_free_export`, eu-vat-rates.ts:97–102)
   — eine steuerlich falsche Ausfuhr-Behandlung für EU-Kunden. **Diese Listen dürfen beim Versand-Rückbau
   nicht angefasst werden.** Der korrekte Hebel sind die Woo-Versandzonen: fehlt die Zone, wird der
   B2C-Checkout blockiert (Abschnitt 3), die Steuerlisten bleiben konsistent.
2. **Wholesale umgeht die Versandzonen komplett** (Flat 10 €, shipping-rate/route.ts:246–265).
   Zonen-Entfernung in Woo stoppt **nur B2C**. Händler aus FR/IT/… könnten weiterhin bestellen, solange
   `WHOLESALE_ALLOWED_COUNTRY_CODES` unverändert bleibt. Wenn Wholesale ebenfalls auf AT+DE beschränkt
   werden soll, muss diese Liste separat geändert werden — Gates: create-payment-intent/route.ts:78–86,
   update-payment-intent/route.ts:71–90, create-bank-order/route.ts:133–145, wc-order-from-payment.ts:467–475,
   Client CheckoutForm.tsx:1473–1478, 3253–3259.
3. **RC-Erkennung kippt nicht durch Zonen-Änderungen** — `isReverseChargeEligible` nutzt
   `EU_REVERSE_CHARGE_COUNTRIES`, nicht die Zonen. Aber: Wird `WHOLESALE_ALLOWED_COUNTRY_CODES` auf AT+DE
   reduziert und `EU_REVERSE_CHARGE_COUNTRIES` nicht, bleibt die RC-Logik theoretisch für DE erreichbar
   (DE-Händler mit DE-UID = RC korrekt) — konsistent. Umgekehrt (RC-Liste kürzen, Wholesale-Liste nicht)
   würden EU-Händler still von RC auf „Wholesale-EU mit ausgewiesener MwSt" fallen
   (notify-wholesale-order.ts:109) — Steuerausweis ändert sich ohne Fehler.
4. **Server-seitig fehlt eine Zonen-Prüfung bei der Order-Anlage:** `/api/sync-order` und
   `/api/create-bank-order` prüfen nur Sperrliste und Wholesale-EU (wc-order-from-payment.ts:459–475),
   nicht ob das Land eine Versandzone hat. Ein veralteter Client (offener Tab), ein Klarna-Payload aus
   sessionStorage (checkout-order-extras.ts:102–147) oder ein PayPal-Recovery-Replay
   (retry-pending-paypal-recoveries.ts:42–48) kann daher auch **nach** der Zonen-Deaktivierung noch eine
   Bestellung mit z. B. FR-Adresse anlegen — mit korrekt gerechneter FR-USt, aber ohne buchbaren Versand.
5. **Dropdown bleibt weltweit:** Entfernt man nur Zonen, sehen EU-Kunden weiterhin ihr Land im Dropdown
   und erfahren erst nach Adresseingabe „Versand nicht verfügbar" (translations.ts:473–476, 490–493).
   Schränkt man stattdessen das Dropdown ein, greift der stille AT-Fallback für gespeicherte
   Profil-Länder (CheckoutForm.tsx:1466–1471) — **Bestandskunden aus FR würden unbemerkt mit Land „AT"
   weiterbestellen** (falscher Steuerpfad AT-B2C!). Das ist der zweite Weg, auf dem ein Steuerpfad
   versehentlich kippen kann.
6. **Woo-Steuertabellen vs. ID-Spiegel:** Werden in WP Steuersätze gelöscht/neu angelegt, stimmen die IDs
   in eu-vat-rates.ts:46–75 nicht mehr → `shipping_lines.taxes[]` referenziert falsche Sätze
   (buildEuB2cWooShippingTaxes, woo-vat-split.ts:43–50). Beim Rückbau die Tabellen daher unangetastet lassen.
7. **PDF-Snippet-Liste** (uncuttv-pdf-baked-coupon-display.php:29–31) muss nur synchron bleiben, solange
   EU-B2C-Bestellungen mit Coupons existieren; sie bricht nicht durch Zonen-Änderungen.
8. Kleinere Inkonsistenzen, die es heute schon gibt: Händler-Dashboard bietet CH an, das die
   Wholesale-Gates ablehnen (HaendlerDashboard.tsx:795–797 vs. wholesale-allowed-countries.ts:1);
   UID-Format nur für 8 Länder (vat-format.ts:16–25); toter `/api/checkout`-Endpoint mit AT/DE/CH
   (checkout/route.ts:45).

---

## 8. Was NICHT im Repo liegt (selbst in WP-Admin/extern zu ändern)

1. **WooCommerce → Versand → Zonen:** EU-Länder außer DE aus den Zonen entfernen (bzw. Zone auf AT+DE
   beschränken), inkl. Free-Shipping-Regel. Das ist der Haupthebel.
2. **WooCommerce → Einstellungen → Allgemein:** „Verkaufe an alle Länder / Liefere nach" — falls dort eine
   Länderliste gepflegt ist, ebenfalls anpassen (nicht im Repo sichtbar).
3. **WooCommerce → Steuer → Standardsätze:** **nicht löschen** (OSS-Historie, ID-Spiegel eu-vat-rates.ts:46–75).
4. **EU VAT Guard Plugin** (WP): Konfiguration prüfen — nicht im Repo sichtbar.
5. **PDF Invoices & Packing Slips** (WP): Footer/Hinweistexte (dort läge ein etwaiger RC-Textblock),
   Template-Auswahl „Simple Premium".
6. **WPCode-Snippets** (WP): Snippets 39/43/44 und `uncuttv_preserve_shipping_tax` bleiben nötig, solange
   RC-/Drittland-Bestellungen (Wholesale, GB/CH/JP-B2C) weiterlaufen — nichts deaktivieren.
7. **Stripe-Dashboard:** Zahlungsmethoden pro Land (Klarna/EPS-Verfügbarkeit) — im Code ungefiltert.
8. **PayPal-Business-Konto:** etwaige Länderrestriktionen — im Code keine.
9. **Google Merchant Center / Google Ads:** Feed- und Kampagnen-Zielländer — kein Feed im Repo.
10. **Ventrha / SendDrop:** separates Repo `D:/UncutTV/Website/uncuttv-versand` und
    `%APPDATA%/VENTRHA/uncuttv-shipping-settings.json` — Länderlisten dort separat prüfen.
11. **Ghost/Newsletter:** kein Länderbezug vorhanden, nichts zu tun.

---

## 9. Bestandsdaten

- **Offene Bestellungen mit EU-Lieferadresse:** bleiben in Woo unverändert (`processing`/`pending`).
  Das Repo rechnet nichts nach — Versandkosten und Steuern werden bei Bestellanlage eingefroren
  (Abschnitt 1). Abwicklung/Storno ist ein manueller Woo-/Ventrha-Vorgang.
- **Vorbestellungen:** Es gibt **keine** Preorder-Logik mit gespeicherter Adresse oder späterer
  Neuberechnung. „Vorverkauf" ist nur ein Kategorie-Slug ([src/lib/stock-display.ts:11–18](../src/lib/stock-display.ts));
  bei gemischten Warenkörben erscheint lediglich ein Hinweisbanner („Wir versenden alles gemeinsam …",
  translations.ts:202–217; CheckoutForm.tsx:2136–2137) — ein Versandposten, keine Splittung, kein
  Nachberechnungs-Job. **Aber:** Für bereits bezahlte Vorbestellungen aus EU-Ländern muss der Versand
  später trotzdem physisch erfolgen (Ventrha), obwohl die Zone dann evtl. schon deaktiviert ist —
  organisatorisch einplanen.
- **Persistierter Warenkorb** (`_uncuttv_persisted_cart`): enthält nur Artikel, keine Adresse
  (src/app/api/cart/persist/route.ts — kein Länder-/Adressfeld).
- **Replay-Pfade, die alte EU-Adressen nachträglich zu Bestellungen machen können** (siehe Risiko 7.4):
  PayPal-Recovery aus localStorage (retry-pending-paypal-recoveries.ts:42–48), Klarna-/Karten-Payload aus
  sessionStorage (checkout-order-extras.ts:102–147, OrderSuccess.tsx:270). Zeitfenster: Sessions, die vor
  der Umstellung begonnen wurden.
- **Wholesale-Bank-Reminder-Cron** mahnt offene Vorkasse-Bestellungen weiter, unabhängig vom Land
  ([src/app/api/cron/wholesale-bank-reminders/route.ts:131–140](../src/app/api/cron/wholesale-bank-reminders/route.ts))
  — offene EU-Wholesale-Bestellungen würden also weiter gemahnt statt storniert.
- **Kundenprofile mit EU-Land:** bleiben gültig. Solange nur Zonen deaktiviert werden, sehen diese Kunden
  im Checkout „Versand nicht verfügbar". Würde das Dropdown eingeschränkt, griffe der stille AT-Fallback
  (Risiko 7.5).

---

## 10. Vorschlag Änderungsreihenfolge (NICHT ausführen)

> Prinzip: **Zonen zuerst (WP), Code-Listen für Steuer unangetastet lassen.** Jeder Schritt nennt, was
> danach kaputt sein könnte.

1. **Entscheidung dokumentieren: Gilt die Abschaltung auch für Wholesale?**
   Ort: keine Datei — Vorentscheidung. Ohne sie stoppt Schritt 2 nur B2C (Risiko 7.2).
2. **WP-Admin → WooCommerce → Versand:** EU-Länder außer DE aus allen Zonen entfernen (AT bleibt).
   Danach: B2C-Checkout für diese Länder blockiert („Versand nicht verfügbar"). Kaputt sein könnte:
   nichts im Code — aber Kunden mit EU-Profil erleben eine Fehlermeldung erst spät im Checkout
   (UX, Abschnitt 7.5); laufende Checkout-Sessions können noch Bestellungen anlegen (7.4).
3. **WP-Admin → WooCommerce → Einstellungen → Allgemein:** „Liefere nach"-Liste angleichen (falls gepflegt).
   Kaputt sein könnte: Store-API-Verhalten ändert sich zusätzlich zur Zone — vorher auf Staging prüfen,
   ob `no_zone` weiterhin sauber zurückkommt (shipping-rate/route.ts:292–301).
4. **Nur falls Wholesale ebenfalls beschränkt wird:** [src/lib/wholesale-allowed-countries.ts:2–30](../src/lib/wholesale-allowed-countries.ts)
   auf `AT, DE` kürzen. Wirkt auf alle vier Server-Gates + Client (Fundstellen in 7.2).
   Kaputt sein könnte: RC-Pfad entfällt für entfernte Länder (gewollt); Bestandshändler aus NL/BE/… erhalten
   403 `wholesale_eu_only` mit dann irreführendem Text „nur innerhalb der EU" (translations.ts:486–489 —
   Text anpassen); Händler-Dashboard-Dropdown (AT/DE/CH) separat bereinigen (HaendlerDashboard.tsx:795–797, 843–845).
5. **Optional UX-Verbesserung im Repo:** eigene „versandfähige Länder"-Prüfung im Dropdown oder ein früher
   Hinweis — **nicht** durch Entfernen aus `world-countries.ts`/`iso-3166-1-alpha2-codes.ts` lösen und
   **keinesfalls** `eu-vat-rates.ts` / `reverse-charge.ts` anfassen (Risiko 7.1). Beim Einschränken des
   Dropdowns zwingend den stillen AT-Fallback (CheckoutForm.tsx:1466–1471) durch eine sichtbare Meldung
   ersetzen, sonst kippt der Steuerpfad für Bestandskunden (Risiko 7.5).
6. **Optional Härtung im Repo:** Zonen-Validierung auch bei der Order-Anlage
   (`/api/sync-order`, `/api/create-bank-order`) ergänzen, damit Replays (7.4) abgewiesen werden.
   Kaputt sein könnte: legitime PayPal-Recovery älterer Käufe schlägt dann fehl → Orphan-Alert-Pfad
   greift (paypal-orphan-order.ts) — bewusst abwägen.
7. **Extern:** Google Merchant Center/Ads-Zielländer, Stripe-Dashboard, PayPal, Ventrha/SendDrop-Repo
   (`uncuttv-versand`) anpassen. Kaputt sein könnte: Merchant-Feed bewirbt Länder ohne Versand
   (Ablehnungen im Merchant Center), Ventrha-Labels für nicht mehr bediente Länder.
8. **Bestandsabwicklung:** offene EU-Bestellungen (inkl. bezahlter Vorbestellungen!) sichten — versenden,
   stornieren oder erstatten; Wholesale-Bank-Reminder für stornierte EU-Bestellungen unterbinden
   (Meta `_uncuttv_skip_reminders`, Snippet 39 Codezeile 13).
9. **Aufräumen (unkritisch):** toten `/api/checkout`-Endpoint entfernen oder Liste angleichen
   (checkout/route.ts:45); Doku-Testfälle mit IT/EU-Beispielen aktualisieren
   (docs/wordpress/WPCODE_SNIPPETS.md:50–55).

---

## Anhang: Alle Länderlisten im Repo auf einen Blick

| # | Liste | Datei:Zeile | Format | Einträge |
|---|---|---|---|---|
| 1 | ISO-Grundmenge | iso-3166-1-alpha2-codes.ts:5–8 | ISO-2, CSV-String | 249 |
| 2 | Sperrliste | blocked-countries.ts:7–37 | ISO-2, Set | 26 |
| 3 | Dropdown-Ausschluss | world-countries.ts:7 | ISO-2, Set | 5 |
| 4 | Dropdown-Priorität | world-countries.ts:4 | ISO-2, Array | 3 (AT, DE, CH) |
| 5 | Wholesale erlaubt | wholesale-allowed-countries.ts:2–30 | ISO-2, Set | 27 (EU-27) |
| 6 | Reverse Charge | reverse-charge.ts:4–31 | ISO-2, as-const-Array | 26 (EU ohne AT) |
| 7 | EU-USt-Sätze | eu-vat-rates.ts:6–34 | ISO-2 → number | 27 |
| 8 | Woo-Tax-Rate-IDs | eu-vat-rates.ts:46–75 | ISO-2 → number | 27 |
| 9 | UID-Muster | vat-format.ts:16–25 | Präfix + Regex | 8 (CHE, AT, DE, IT, FR, NL, BE, ES) |
| 10 | Multi-Versand | shipping-rate/route.ts:6 | ISO-2, Set | 2 (AT, DE) |
| 11 | GLS-Filter | filter-de-at-shipping-rates.ts:18 | ISO-2, Inline | 2 (AT, DE) |
| 12 | Free-Shipping-Hinweis | free-shipping-suggestion.ts:4 | ISO-2, Set | 2 (DE, AT) |
| 13 | Legacy Stripe-Session | checkout/route.ts:45 | ISO-2, Array | 3 (AT, DE, CH) — toter Code |
| 14 | Händler-Dashboard | HaendlerDashboard.tsx:795–797, 843–845 | ISO-2 + deutsche Klarnamen | 3 (AT, DE, CH) |
| 15 | PDF-Coupon (WP-PHP) | docs/wordpress/uncuttv-pdf-baked-coupon-display.php:29–31 | ISO-2, PHP-Array | 26 (EU ohne AT) |
| 16 | CAPI-Vorwahlen | meta-capi-phone.ts:1–32 | ISO-2 → Vorwahl | 29 |

Nicht im Repo (extern): Woo-Versandzonen, Woo-„Liefere nach"-Einstellung, Woo-Steuertabellen,
EU-VAT-Guard-Konfiguration, PDF-Plugin-Texte, Stripe-/PayPal-Länderoptionen, Merchant-Center-Zielländer,
Ventrha/SendDrop-Länder (Repo `uncuttv-versand`).
