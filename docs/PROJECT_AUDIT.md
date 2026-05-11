# UNCUTTV Web — Projekt-Audit

Stand der Analyse: Codebasis im Repository `uncuttvweb` (Next.js App unter `src/`). Alle Aussagen beziehen sich auf nachvollziehbare Dateipfade. Wo im Repo nichts gefunden wurde, ist das explizit markiert.

---

## 1. PROJEKT-ÜBERSICHT

### Stack (Dependencies + Versionen)

Quelle: `package.json`

| Paket | Version |
|-------|---------|
| next | 16.2.2 |
| react | 19.2.4 |
| react-dom | 19.2.4 |
| stripe | ^22.0.0 |
| @stripe/stripe-js | ^9.0.1 |
| @stripe/react-stripe-js | ^6.1.0 |
| @paypal/react-paypal-js | ^9.1.0 |
| jsonwebtoken | ^9.0.3 |
| pdf-lib | ^1.17.1 |
| tailwindcss | ^4 |
| @tailwindcss/postcss | ^4 |
| typescript | ^5 |
| eslint | ^9 |
| eslint-config-next | 16.2.2 |

### Scripts

Quelle: `package.json`

| Script | Befehl |
|--------|--------|
| `npm run dev` | `next dev` |
| `npm run build` | `next build` |
| `npm run start` | `next start` |
| `npm run lint` | `eslint` |

### Node-Version

- **`.nvmrc`**: NICHT VORHANDEN (keine Datei im Repo).
- **`package.json` → `engines`**: NICHT VORHANDEN.

### Datei-Struktur (Kurzbaum mit 1-Zeilen-Beschreibungen)

```
src/app/                 — Next.js App Router: Seiten, Layout, API-Routen
src/app/api/             — Route Handlers (REST-artige Endpoints)
src/app/shop/            — B2C-Shoplisting + dynamische Produktdetailseiten
src/app/haendler/        — Händler-Landing, Dashboard, Produktseite, Anfrage-Formular
src/app/konto/           — Kundenkonto Login + Dashboard
src/app/checkout/        — Checkout-Seite
src/app/bestellung/erfolg/ — Bestellbestätigung nach Zahlung
src/components/          — React-UI (Navbar, Shop, Checkout, Händler, …)
src/lib/                 — WooCommerce-Client, Cart/Language Context, Stripe-Helper, Types
src/types/               — TypeScript-Typen (z. B. Händler-Anfrage-Body)
data/                    — Statische Konfiguration (promo-banner.json)
public/                  — Statische Assets (Favicons, Platzhalter-SVGs)
```

**`public/`** (tatsächlich vorhandene Dateien): `favicon.svg`, `favicon.ico` (Referenz in `layout.tsx`), `file.svg`, `vercel.svg`, `window.svg`.

---

## 2. ENVIRONMENT-VARIABLEN

Ermittelt durch Volltextsuche nach `process.env` in `src/` (kein Duplikat-Zählen über Pfade).

| Variable | Verwendung (Dateipfad) | Public / Server | Sensitiv |
|----------|-------------------------|-----------------|----------|
| `WOOCOMMERCE_URL` | `src/lib/woocommerce.ts`; diverse API-Routes (`auth/*`, `haendler/*`, `sync-order`, `create-bank-order`, `orders/invoice`, `password-reset`, …) | Server | ja (Basis-URL Backend) |
| `WOOCOMMERCE_KEY` | wie oben (Basic Auth Consumer Key) | Server | ja |
| `WOOCOMMERCE_SECRET` | wie oben (Consumer Secret) | Server | ja |
| `STRIPE_SECRET_KEY` | `src/lib/stripe.ts`; Log-Prefix in `src/app/api/create-payment-intent/route.ts` | Server | ja |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `src/components/CheckoutForm.tsx` (loadStripe + Debug-Log) | **Public** (NEXT_PUBLIC_) | mittel (Publishable Key) |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | `src/components/CheckoutForm.tsx` | **Public** | mittel |
| `NEXT_PUBLIC_META_PIXEL_ID` | `src/components/CookieConsent.tsx` | **Public** | gering–mittel |
| `RESEND_API_KEY` | `src/app/api/contact/route.ts`; `create-bank-order`; `newsletter/subscribe`; `haendler/anfrage` | Server | ja |
| `GHOST_API_URL` | `src/app/api/newsletter/subscribe/route.ts` | Server | mittel |
| `GHOST_ADMIN_API_KEY` | `src/app/api/newsletter/subscribe/route.ts` (JWT für Ghost Admin) | Server | ja |
| `ANTHROPIC_API_KEY` | `src/app/api/translate/route.ts` | Server | ja |
| `NODE_ENV` | Cookie-`secure`-Flags in `auth/login`, `auth/register`, `auth/change-password`, `haendler/login` | Server/Framework | nein |

**Explizit im Code NICHT referenziert** (Suche in `src/`): `SUPABASE_*`, `VERCEL_*` (als process.env), WordPress **Application Password**-Env, separates **Meta Pixel** Secret (nur `NEXT_PUBLIC_META_PIXEL_ID`).

**JWT:** Es gibt keine Umgebungsvariable `JWT_SECRET` o. ä. für die *WordPress*-JWT — der Shop ruft das WordPress-Plugin unter `…/wp-json/jwt-auth/v1/token` auf (siehe Abschnitt 11).

**Stripe test/live:** Im Anwendungscode wird der Modus nicht ausgewertet; er ergibt sich implizit aus dem Präfix des Secrets (`sk_test_…` / `sk_live_…`). **Ohne lesbare `.env.local` im Repo:** UNKLAR — bitte verifizieren.

---

## 3. HÄNDLER-PORTAL (B2B)

### 3.1 Routes

| Route | Rolle |
|-------|--------|
| `/haendler` | Server-Page: bei gesetztem Cookie `haendler_token` → Redirect zu `/haendler/dashboard`, sonst Login-UI (`HaendlerAuth`). Quelle: `src/app/haendler/page.tsx` |
| `/haendler/dashboard` | Dashboard (`HaendlerDashboard`). Quelle: `src/app/haendler/dashboard/page.tsx` |
| `/haendler/produkt/[slug]` | Produktdetail; ohne `haendler_token` → Redirect `/haendler`. Quelle: `src/app/haendler/produkt/[slug]/page.tsx` |
| `/haendler/anfrage` | Formular „Händler-Anfrage“ (nicht dieselbe Registrierung wie `/api/haendler/register`). Quelle: `src/app/haendler/anfrage/page.tsx` |

**API unter `src/app/api/haendler/`:**

| Pfad | Methode |
|------|---------|
| `haendler/login` | POST |
| `haendler/logout` | POST |
| `haendler/products` | GET |
| `haendler/invoice` | GET |
| `haendler/register` | POST |
| `haendler/anfrage` | POST |

### 3.2 Authentifizierung

**Ablauf Login** (`src/app/api/haendler/login/route.ts`):

1. POST mit `{ email, password }`.
2. `POST ${WOOCOMMERCE_URL}/wp-json/jwt-auth/v1/token` mit Body `{ username: email, password }` (JSON).
3. Bei Erfolg: `GET ${WOOCOMMERCE_URL}/wp-json/wp/v2/users/me?context=edit` mit `Authorization: Bearer <token>`.
4. Rollen aus `roles`, `capabilities`, `extra_capabilities` gesammelt; erlaubt: `wholesale`, `administrator`, `shop_manager` (Konstante `ALLOWED_ROLES`).
5. Ohne passende Rolle: HTTP **403** mit Text zur noch nicht freigeschalteten Anfrage.

**Cookies** (alle mit `httpOnly: true`, `path: "/"`, `maxAge: 60*60*24*30` = 30 Tage, `secure: production`):

- `haendler_token` — JWT von WordPress  
- `haendler_id` — WordPress-User-ID  
- `haendler_email`  
- `haendler_role` — gematchte Rolle (Fallback-String `"wholesale"` wenn Match aus capabilities kommt)

**Rolle `wholesale`:** explizit in `ALLOWED_ROLES` und in der kombinierten Rollenliste gegen `allRoles` geprüft (`src/app/api/haendler/login/route.ts`).

**Nicht freigeschalteter User:** Kein `wholesale` / Admin / Shop Manager → 403, keine Session-Cookies.

**Logout:** `POST /api/haendler/logout` löscht die vier Cookies (`src/app/api/haendler/logout/route.ts`). Dashboard ruft das und navigiert zu `/haendler` (`HaendlerDashboard`).

### 3.3 Registrierung

**Zwei getrennte Wege im Code:**

1. **`POST /api/haendler/register`** (`src/app/api/haendler/register/route.ts`): Felder `email`, `password`, `firstName`, `lastName`, `company`, `phone`, `address` (Pflicht laut Code: email, password, firstName, lastName, company). Anlage über **`POST …/wp-json/wc/v3/customers`** mit Basic Auth (Key/Secret). **Kein** `role: "wholesale"` im JSON-Body — die WooCommerce-Standardrolle des Kunden gilt (im Code nicht gesetzt).
2. **`/haendler/anfrage` + `POST /api/haendler/anfrage`:** ausführliches Bewerbungsformular (Typ `src/types/haendlerAnfrage.ts`), E-Mail über **Resend** an `office@uncuttv.at` und Bestätigung an Antragsteller — **nur wenn** `RESEND_API_KEY` gesetzt und nicht gleich `"your_resend_api_key"`; sonst Logging und `{ success: true }` (`src/app/api/haendler/anfrage/route.ts`).

**E-Mail an office@uncuttv.at bei `/api/haendler/register`:** Der Block mit `fetch(…/wp-json/wp/v2/users` POST ohne Auth/Body ist **keine** funktionale Mail-Implementierung; es wird nur geloggt. **→ Für reinen WC-Register-Flow: NICHT IMPLEMENTIERT (kein Resend/kein zuverlässiger WP-Mail-Trigger im Code).**

**Wer setzt `wholesale`:** Im Repo **nicht** automatisiert — es wird explizit nur WordPress/WooCommerce-Seite vorausgesetzt (Login prüft Rollen). **→ Manuell / außerhalb dieses Codes (WordPress-Admin o. ä.) — im Repo nicht dokumentiert.**

### 3.4 Preis-Logik `haendler_preis`

**Quelle:** WooCommerce-Produkt **`meta_data`** (kein separater ACF-Key-Name im Code — wenn ACF in Woo als `meta_data` landet, wäre es indirekt; der Code sucht nur nach Keys):

- `haendler_preis`, `_haendler_preis`, `wholesale_price`, `_wholesale_price`  
  Quelle: `src/app/api/haendler/products/route.ts` (Map auf Feld `haendler_preis` im JSON-Response).

**API-Pfad in der Antwort:** Oberflächlich `GET /api/haendler/products` → JSON-Array von Produkten mit zusätzlichem Top-Level-Feld `haendler_preis` (String, leer wenn nicht gefunden).

**Frontend ohne Preis:** „Preis auf Anfrage“ / `t("PREIS_ANFRAGEN")` etc. — `src/components/HaendlerProduct.tsx`, `HaendlerDashboard.tsx` (`hasHaendlerPreis`).

**Warenkorb:** `HaendlerProduct.handleAddToCart` setzt `price: product.haendler_preis || product.price` vor `addToCart` (`src/components/HaendlerProduct.tsx`). **`CartContext`** summiert `parseFloat(i.product.price)` (`src/lib/CartContext.tsx`) — damit wird der **überschriebene** `price` für Totals/Checkout verwendet, sofern `haendler_preis` gesetzt ist; sonst Endkundenpreis.

**Brutto/Netto:** Keine eigene MwSt-Logik im Checkout-Warenkorb; WooCommerce-Produktpreise werden als Zahlen-Strings weitergereicht. **PDF Händler-Rechnung:** Netto aus Summe der Line-Items mit **fester 20%-USt.-Annahme** (`vatRate = 0.2`), `order.total` als Brutto — `src/app/api/haendler/invoice/route.ts`.

### 3.5 PDF-Rechnungen (Händler)

- **Library:** `pdf-lib` (`import { PDFDocument, … } from "pdf-lib"` in `src/app/api/haendler/invoice/route.ts`).
- **Route:** `GET /api/haendler/invoice?order_id=…`
- **Speicherung:** **On-the-fly** als `NextResponse` mit PDF-Bytes, `Content-Disposition: attachment` — keine Persistenz im Next-Projekt.
- **Inhalt (Auszug):** Logo-Text UNCUT/TV, Firmenzeilen, Rechnungsanschrift aus Order-`billing`, UID aus `meta_data` Key `uid_nummer` (Kunde bevorzugt, sonst Order), optional Lieferanschrift aus `customer.shipping`, Rechnungsnummer-Schema `RE-${order.number}-2026`, Tabelle aus `line_items`, Netto/USt 20%/Gesamtbetrag, Footer mit IBAN/Zahlungsziel.

### 3.6 Cart / Checkout vs. B2C

- **Cart-State:** **Gemeinsam** — `CartProvider` + `localStorage` Key `uncuttv_cart` (`src/lib/CartContext.tsx`). Kein separater B2B-Store.
- **Zahlungsmethoden Checkout:** Karte (Stripe `CardElement`), Überweisung (`/api/create-bank-order`), PayPal, Klarna, EPS — `src/components/CheckoutForm.tsx` (Typ `PaymentMethod`). Keine Abgrenzung „nur Überweisung für Händler“ im Code.
- **Coupon:** Im Warenkorb ausgeblendet für `isB2B` (`pathname` startet mit `/haendler` **oder** `document.cookie` match auf `haendler_token`) — `src/components/CartDrawer.tsx`. **Hinweis:** `haendler_token` ist **HttpOnly** (`haendler/login`) — Browser-`document.cookie` enthält ihn typischerweise **nicht**. Die B2B-Erkennung per Cookie ist damit **außerhalb von `/haendler*` praktisch unzuverlässig** (nur Pfad-Teil funktioniert sicher).
- **WooCommerce „wholesale“-Tag an Bestellung:** In `create-bank-order` und `sync-order` werden **keine** Bestell-`meta_data` oder Tags für „wholesale“ gesetzt — **NICHT IMPLEMENTIERT** im geprüften Code.

### 3.7 Bekannte Lücken / Stubs

- `haendler/register`: Dummy-`fetch` zu `wp/v2/users`, kein Office-Mailweg im Code.
- B2B-Coupon-Hide per `document.cookie` + HttpOnly — wahrscheinlich inkonsistent.
- Keine Kennzeichnung von Händlerbestellungen in Woo an den genannten API-Stellen.
- `grep` nach `TODO|FIXME|HACK|XXX|stubbed` in `src/`: **keine Treffer**.

---

## 4. SHOP (B2C) — Kern-Flows

- **Landing → Shop:** `src/app/page.tsx` ruft `redirect("/shop")` auf (Next.js App Router: Standard **307** Temporary Redirect, sofern Framework nicht überschrieben — kein `permanentRedirect` im File).
- **Age-Gate:** `src/app/shop/ShopPage.tsx` — `localStorage` Key `agegate_confirmed`, Wert `"1"`. Kein Ablaufdatum im Code (praktisch bis manuell gelöscht).
- **Cookie-Banner + Pixel:** `CookieConsent` — `localStorage` Key `cookie_consent`: Werte `all` oder `necessary`. Meta Pixel Script wird nur bei `all` oder nachträglich bei Akzeptieren geladen (`src/components/CookieConsent.tsx`). `NEXT_PUBLIC_META_PIXEL_ID` wird geprüft; Platzhalter `"your_meta_pixel_id"` wird übersprungen.
- **Katalog / Kategorie-Sortierung:** Horizontale Pills: festes `order`-Array in `src/components/ShopContent.tsx` (`vorverkauf`, `brandneu`, `sale`, `jetzt-erhaeltlich`, `underground-collection`, `outofprint`). Vertikale Sektionen: „Jetzt vorbestellen“ = Kategorie-Slug `vorverkauf`, „Neu“ = `brandneu`, „Jetzt erhältlich“ = Produkte mit `instock` **ohne** `outofprint` (Konstanten `INSTOCK_SLUG`, `OOP_SLUG` in derselben Datei).
- **Produktdetail:** `src/app/shop/[slug]/page.tsx` — Produkt via `wooFetch("/products", { slug })`, erstes Element. Related: wenn `related_ids`, dann `wooFetch("/products", { include: ids, per_page: "4" })`.
- **Cart Drawer:** `useCart()` aus `src/lib/CartContext.tsx`; UI `src/components/CartDrawer.tsx`.
- **Checkout Stripe:** Primär **PaymentIntent** (`/api/create-payment-intent`) + `CardElement` bzw. `confirmPayment` für Klarna/EPS (`CheckoutForm.tsx`). **`POST /api/checkout`** implementiert **Stripe Checkout Session** (`stripe.checkout.sessions.create`) — **im `src/`-Tree gibt es keine Referenz auf `/api/checkout`** (Suche: kein Match) → Route wirkt **unbenutzt / tot** vom aktuellen Frontend.
- **PayPal:** Nach Capture wird `/api/sync-order` mit erfundener `paymentIntentId` `paypal_<id>` aufgerufen — `CheckoutForm.tsx`.
- **Erfolgsseite:** `src/app/bestellung/erfolg/page.tsx` + `OrderSuccess` (`src/components/OrderSuccess.tsx`): Query-Parameter `session_id`, `payment_intent`, `redirect_status`, `method` (`bank`, `paypal`, …), `order` (Bank). Sync: bei `session_id` POST `sync-order` mit Session; bei reinem `payment_intent` (Redirect-Flow) erneuter Sync mit Daten aus `/api/order-details` (Hinweis: dort können Adress-Felder leer an `sync-order` gehen, siehe Code).
- **WooCommerce Sync nach Payment:** `src/app/api/sync-order/route.ts` — entweder Session (`payment_status === "paid"`) mit `metadata.cart_items` oder PaymentIntent-Flow mit Body `paymentIntentId`, `customer`, `items`; legt Order bei Woo mit `payment_method: "stripe"` / `set_paid: true` und `line_items` mit `total` aus `price * qty` an.

---

## 5. KUNDENKONTO (`/konto`)

- **Login:** Client → `POST /api/auth/login` — JWT wie Händler (`…/jwt-auth/v1/token`), dann Woo-Kunde per E-Mail-Suche (`src/app/api/auth/login/route.ts`). Cookies: `woo_customer_id`, `woo_customer_email`, `woo_customer_role`, `woo_token` (httpOnly), `woo_customer_name` (nicht httpOnly, nur Vorname).
- **Dashboard:** `src/components/Dashboard.tsx` lädt `GET /api/auth/me` — inkl. `orders` (bis zu 20 vom Backend, siehe unten).
- **Bestellhistorie:** Backend `GET /api/auth/me` holt `orders?customer=…&per_page=20` (`src/app/api/auth/me/route.ts`). Dashboard paginiert clientseitig mit `ORDERS_PER_PAGE = 3` (`Dashboard.tsx`).
- **Passwort ändern:** `POST /api/auth/change-password` — altes Passwort durch erneuten JWT-Login geprüft, Update über `POST …/wp-json/wp/v2/users/me` mit Bearer-Token, danach optional neues JWT in Cookie (`src/app/api/auth/change-password/route.ts`).

**Registrierung B2C:** `POST /api/auth/register` setzt nur `woo_customer_id` und `woo_customer_email` — **nicht** `woo_token` / keine vollständige Session wie nach Login (`src/app/api/auth/register/route.ts`). **→ Lücke: Nutzer ist nach „Registrierung“ ohne separaten Login ggf. nicht JWT-authentifiziert.**

---

## 6. NEWSLETTER / GHOST

- **Route:** `POST /api/newsletter/subscribe` — `src/app/api/newsletter/subscribe/route.ts`.
- **Ghost:** Admin-Token per JWT aus `GHOST_ADMIN_API_KEY` (Format mit `:`-Segmenten, siehe `createGhostToken`), dann `POST ${GHOST_API_URL}/ghost/api/admin/members/` mit Header `Authorization: Ghost <token>`.
- **WELCOME10:** Statischer Text in Resend-HTML; zusätzlich setzt der Warenkorb bei erfolgreicher Newsletter-Checkbox den Query `?coupon=WELCOME10` — keine dynamische Code-Generierung im Code. Stripe-Coupon muss in Stripe existieren (`/api/validate-coupon` / `create-payment-intent`).
- **Duplikat:** Ghost-Responses **409** oder **422** → JSON mit `alreadySubscribed` / Fehlermeldung — **implementiert**.

**Wenn Ghost nicht konfiguriert ist:** Es wird trotzdem `success: true` zurückgegeben (nur Log) und Welcome-Mail über Resend versucht — `subscribe/route.ts`.

---

## 7. KONTAKT / RESEND

- **Route:** `POST /api/contact` — `src/app/api/contact/route.ts`.
- **Ohne API-Key:** Log auf der Konsole, Response **`{ success: true }`** (gleiches Muster wie andere Resend-Stellen).
- **Empfänger:** hardcoded `to: ["office@uncuttv.at"]`, `from: "UncutTV Kontakt <kontakt@uncuttv.at>"`.

---

## 8. ÜBERSETZUNG (DE/EN)

- **Statische UI-Strings:** `src/lib/translations.ts` (`createT`, `translateCategoryName`, `translateDetailLabel`, …).
- **Sprache:** `src/lib/LanguageContext.tsx` — `localStorage` `uncuttv_language`, Polling **alle 300 ms** mit Kommentar zu iOS Safari / fehlenden Storage-Events (Zeilen 45–46).
- **Produkt-Übersetzung:** `src/components/ProductDetail.tsx` ruft bei Sprache EN `POST /api/translate` auf. **`/api/translate`** nutzt Anthropic Claude (`claude-haiku-4-5-20251001`) wenn Key gesetzt; sonst Originaltext — **implementiert**, mit Fallback ohne Key (`src/app/api/translate/route.ts`).

---

## 9. MOBILE-SPEZIFIKA

- **Navbar Mobile-Menü:** Zusätzlich zu React-State ein **`useEffect`** bindet `click`/`touchend` an DOM-IDs (`hamburger-btn`, `mobile-menu`, …) — Kommentar in der Datei nennt explizit die Anbindung nach Hydration (`src/components/Navbar.tsx` ~340–413). **„dangerouslySetInnerHTML“:** genutzt für ein **`<style>`**-Block mit Keyframes/Hover für Menü-Animationen — **nicht** für das gesamte Menü-HTML (Zeilen 634–683).
- **MobileNewsletterBanner / SplitCta:** Kommentar „Vanilla JS — bypasses React for iOS Safari“ — `src/components/MobileNewsletterBanner.tsx`, `src/components/SplitCta.tsx`.
- **MobileBanner:** Import statischer JSON-Daten `import promoData from "../../data/promo-banner.json"` (`src/components/MobileBanner.tsx`). **Kein** Kommentar zu „iOS-Limitation“ in dieser Datei — **warum kein fetch:** im Code nicht begründet; parallel existiert `GET/POST /api/promo-banner` zum Lesen/Schreiben von derselben JSON-Datei auf dem Server (`src/app/api/promo-banner/route.ts`), wird vom `MobileBanner` aber **nicht** aufgerufen.

---

## 10. WOOCOMMERCE-INTEGRATION

**Datei:** `src/lib/woocommerce.ts`

**Exporte:**

- `wooFetch<T>(endpoint, params?)` — einzelner GET, `cache: "no-store"`, Basic Auth, Basis `…/wp-json/wc/v3`.
- `wooFetchAll<T>(endpoint, params?)` — Pagination über Header `x-wp-totalpages`, Standard `per_page` 100 wenn nicht gesetzt, alle Seiten parallel ab Seite 2.

**Auth:** Basic mit `WOOCOMMERCE_KEY` / `WOOCOMMERCE_SECRET`.

**Genutzte Endpoints (Auswahl aus dem Code):** `/products`, `/products/categories`, `/customers`, `/customers/:id`, `/orders`, `/orders/:id` — jeweils über vollständige URLs in verschiedenen Routes/Client.

**Caching:** durchgängig `cache: "no-store"` in `wooFetch` / `wooFetchAll`. **Kein** `revalidate` in `woocommerce.ts`.

**Limits:** `per_page` häufig 100; `wooFetchAll` für alle Seiten; `auth/me` nutzt `per_page=20` für Orders.

---

## 11. WORDPRESS (außer WooCommerce REST)

- **JWT:** Endpunkt `wp-json/jwt-auth/v1/token` — typisch für das Plugin „JWT Authentication for WP REST API“; im Repo **kein** Plugin-Name hardcoded, nur URL.
- **Application Password:** **NICHT VORHANDEN** in der durchsuchten Codebasis (keine Nutzung von WP Application Passwords für API-Calls).
- **`haendler_preis`:** siehe Abschnitt 3.4 — nur Woo **`meta_data`**, kein expliziter ACF-API-Name im TypeScript.

---

## 12. STRIPE-INTEGRATION

- **Secret / Publishable:** `src/lib/stripe.ts`, `CheckoutForm.tsx`, `create-payment-intent`, `validate-coupon`, `order-details`, `sync-order`, `checkout` Route.
- **Webhook:** **NICHT VORHANDEN** (kein `webhook` String in `src/`).
- **PaymentIntent:** `automatic_payment_methods: { enabled: true }` in `create-payment-intent/route.ts` — welche Methoden live aktiv sind, hängt vom Stripe-Dashboard ab.
- **Checkout Session:** in `src/app/api/checkout/route.ts`, aber Frontend nutzt sie **nicht** (keine Referenz).

---

## 13. API-ROUTES — Tabelle

| Pfad | Methode | Auth / Schutz | Zweck | Aufgerufen von (Beispiele) |
|------|---------|---------------|--------|----------------------------|
| `/api/auth/login` | POST | nein | JWT + Woo-Session-Cookies | Konto-Login-UI |
| `/api/auth/logout` | POST | nein (löscht Cookies) | Logout Kunde | Navbar |
| `/api/auth/register` | POST | nein | Woo Customer anlegen + Teil-Cookies | `AuthForms` |
| `/api/auth/me` | GET | Cookie `woo_customer_id` | Profil + Orders | Dashboard, Checkout Prefill, Händler-Dashboard |
| `/api/auth/update` | PUT | Cookie `woo_customer_id` **oder** `haendler_id` | Kunde PATCH Woo | Dashboard, Händler-Dashboard |
| `/api/auth/change-password` | POST | Cookies Woo | Passwort ändern | `Dashboard.tsx` |
| `/api/haendler/login` | POST | nein | Händler-Session | `HaendlerAuth.tsx` |
| `/api/haendler/logout` | POST | nein | Händler-Cookies löschen | `HaendlerDashboard.tsx` |
| `/api/haendler/products` | GET | Cookie `haendler_token` | Produkte + Meta | Händler-UI |
| `/api/haendler/invoice` | GET | Cookie `haendler_email` + Order-Match | PDF | `HaendlerDashboard` |
| `/api/haendler/register` | POST | nein | WC Customer | (falls genutzt) |
| `/api/haendler/anfrage` | POST | nein | Resend E-Mails | `haendler/anfrage/page.tsx` |
| `/api/create-payment-intent` | POST | nein | Stripe PI | `CheckoutForm.tsx` |
| `/api/create-bank-order` | POST | nein | Woo Order pending + Mail | `CheckoutForm.tsx` |
| `/api/sync-order` | POST | nein | Woo nach Zahlung | `CheckoutForm`, `OrderSuccess` |
| `/api/order-details` | GET | nein (kenntnis Session/PI-ID) | Stripe-Daten für UI | `OrderSuccess.tsx` |
| `/api/checkout` | POST | nein | Checkout Session URL | **Kein Aufruf im src gefunden** |
| `/api/validate-coupon` | GET | nein | Stripe Promotion/Coupon | `CartDrawer`, `CheckoutForm` |
| `/api/newsletter/subscribe` | POST | nein | Ghost + Resend | `Newsletter`, `CartDrawer`, `MobileNewsletterBanner` |
| `/api/contact` | POST | nein | Resend an Office | `ContactForm.tsx` |
| `/api/translate` | POST | nein | Anthropic | `ProductDetail.tsx` |
| `/api/password-reset` | POST | nein | POST auf `wp-login.php?action=lostpassword` | Passwort-vergessen-UI |
| `/api/orders/invoice` | GET | Cookie `woo_customer_email` | PDF B2C | `Dashboard.tsx` |
| `/api/test-woo` | GET | **kein** | Debug Woo | manuell / Entwicklung |
| `/api/promo-banner` | GET, POST | **POST ohne Auth** (schreibt Datei!) | Promo JSON lesen/schreiben | potenziell extern — **nicht** vom `MobileBanner` genutzt |

---

## 14. BEKANNTE BUGS / TODOs

- `TODO`, `FIXME`, `HACK`, `XXX`, `stubbed` in `src/` und `src/app/`: **keine Treffer** (reine `grep`-Suche).
- Platzhalter-Strings wie `your_resend_api_key` werden in mehreren Dateien als Abschaltbedingung genutzt (kein klassisches TODO-Keyword).

---

## 15. DEPLOY-STATUS

- **`vercel.json`:** NICHT VORHANDEN im Repo-Root (Glob).
- **`next.config.ts`:** nur `images.remotePatterns` für Hostname `uncuttv.at` — keine Redirects/Rewrites/Headers (`next.config.ts`).
- **Domains:** `uncuttv.at` in Links (Newsletter-Mail, CookieConsent-Texte), Kontakt-Mailadressen, `next/image` — **keine** zentrale Konfigurationsdatei mit Production-Domain für alle Builds.

---

## 16. SECURITY (oberflächlich)

- **`.env*`:** in `.gitignore` eingetragen — typischerweise nicht committed.
- **`git log -S".env.local"`** (lokal ausgeführt): **keine** Treffer in der sichtbaren History (kein Beweis für früheres Committen; bei leerer History nicht belastbar).
- **Offene API-Routen:** u. a. `POST /api/sync-order`, `POST /api/create-bank-order`, `POST /api/create-payment-intent` ohne App-internes Rate-Limiting — **Rate-Limiting: NICHT VORHANDEN** im Code.
- **`POST /api/promo-banner`:** schreibt `data/promo-banner.json` ohne Authentifizierung — **hohes Risiko**, wenn Route in Produktion erreichbar ist.
- **CORS:** keine explizite CORS-Konfiguration im durchsuchten Code gefunden.

---

## ÜBERRASCHUNGEN (für Onboarding)

1. **Zwei Händler-Onboarding-Pfade:** WooCommerce-`register` vs. ausführliches **Anfrage-Formular** mit Resend — unterschiedliche Daten und keine gemeinsame „Freigabe“-Logik im Next-Code.
2. **`/api/checkout` (Stripe Hosted Checkout)** existiert, wird vom aktuellen Frontend aber **nicht** referenziert; der Live-Flow ist **PaymentIntent + Elements** (+ Bank + PayPal).
3. **PayPal → Woo:** `sync-order` bekommt keine echte Stripe-Intent-ID, sondern `paypal_<orderId>` als `transaction_id` — außerhalb klassischer Stripe-only-Architekturen.
4. **Händler-Dashboard** lädt Bestellungen über **`/api/auth/me`** (Kundenkonto-API) statt über eine dedizierte Händler-Order-API — funktioniert nur, wenn WooCommerce-Kunde und WP-User zur gleichen Identität passen.
5. **`auth/register`** setzt keine vollständigen Session-Cookies wie der Login — UX/Auth-Lücke.
6. **B2B-Coupon-Ausblendung** verlässt sich teilweise auf lesbaren `haendler_token` im `document.cookie`, obwohl das Token **HttpOnly** gesetzt wird.
7. **Ghost optional:** Newsletter kann „erfolgreich“ sein ohne Ghost, inkl. Welcome-Mail-Versuch.
8. **Kein Stripe-Webhook** — Abgleich mit Woo hängt an Client/Redirect und `sync-order`-Aufrufen.

---

*Ende des Audit-Dokuments.*
