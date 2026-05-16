const translations: Record<string, Record<string, string>> = {
  // Navigation
  STREAMING: { de: "STREAMING", en: "STREAMING" },
  SHOP: { de: "SHOP", en: "SHOP" },
  MEIN_KONTO: { de: "MEIN KONTO", en: "MY ACCOUNT" },
  HAENDLER: { de: "HÄNDLER", en: "DEALERS" },

  // Shop sections
  JETZT_VORBESTELLEN: { de: "JETZT VORBESTELLEN", en: "PRE-ORDER NOW" },
  NEU: { de: "NEU", en: "NEW" },
  JETZT_ERHAELTLICH: { de: "JETZT ERHÄLTLICH", en: "AVAILABLE NOW" },
  ALLE_RELEASES: { de: "ALLE RELEASES", en: "ALL RELEASES" },
  MEHR_ANZEIGEN: { de: "MEHR ANZEIGEN", en: "SHOW MORE" },
  WENIGER_ANZEIGEN: { de: "WENIGER ANZEIGEN", en: "SHOW LESS" },
  MEHR_ANSEHEN: { de: "MEHR ANSEHEN", en: "VIEW MORE" },
  IN_DEN_WARENKORB: { de: "IN DEN WARENKORB", en: "ADD TO CART" },
  HINZUGEFUEGT: { de: "HINZUGEFÜGT ✓", en: "ADDED ✓" },
  AUSVERKAUFT: { de: "AUSVERKAUFT", en: "SOLD OUT" },
  VORVERKAUF: { de: "VORVERKAUF", en: "PRE-ORDER" },
  AUF_LAGER: { de: "AUF LAGER", en: "IN STOCK" },
  PREIS_AUF_ANFRAGE: { de: "Preis auf Anfrage", en: "Price on request" },
  ALLE: { de: "ALLE", en: "ALL" },
  KEINE_PRODUKTE: { de: "Keine Produkte in dieser Kategorie.", en: "No products in this category." },
  KEINE_ERGEBNISSE: { de: "Keine Ergebnisse gefunden.", en: "No results found." },
  SUCHE_PLACEHOLDER: { de: "FILME & PRODUKTE SUCHEN...", en: "SEARCH FILMS & PRODUCTS..." },

  // Product detail
  DETAILS: { de: "DETAILS", en: "DETAILS" },
  BESCHREIBUNG: { de: "BESCHREIBUNG", en: "DESCRIPTION" },
  KATEGORIE: { de: "KATEGORIE:", en: "CATEGORY:" },
  AEHNLICHE_PRODUKTE: { de: "ÄHNLICHE PRODUKTE", en: "RELATED PRODUCTS" },

  // Cart
  WARENKORB: { de: "WARENKORB", en: "CART" },
  WARENKORB_LEER: { de: "Dein Warenkorb ist leer.", en: "Your cart is empty." },
  GESAMT: { de: "GESAMT", en: "TOTAL" },
  ZUR_KASSE: { de: "ZUR KASSE", en: "CHECKOUT" },
  WEITER_EINKAUFEN: { de: "WEITER EINKAUFEN", en: "CONTINUE SHOPPING" },
  GUTSCHEIN_PLACEHOLDER: { de: "Gutschein-Code eingeben", en: "Enter coupon code" },
  EINLOESEN: { de: "EINLÖSEN", en: "APPLY" },
  NEWSLETTER_CHECKOUT: {
    de: "Jetzt Newsletter abonnieren und 10% Rabatt auf die erste Bestellung erhalten",
    en: "Subscribe to our newsletter and get 10% off your first order",
  },

  // Checkout
  KONTAKT: { de: "KONTAKT", en: "CONTACT" },
  LIEFERADRESSE: { de: "LIEFERADRESSE", en: "SHIPPING ADDRESS" },
  ZAHLUNG: { de: "ZAHLUNG", en: "PAYMENT" },
  JETZT_KAUFEN: { de: "JETZT KAUFEN", en: "BUY NOW" },
  BESTELLUNG: { de: "BESTELLUNG", en: "ORDER" },
  VORNAME: { de: "VORNAME", en: "FIRST NAME" },
  NACHNAME: { de: "NACHNAME", en: "LAST NAME" },
  STRASSE: { de: "STRASSE + HAUSNUMMER", en: "STREET + NUMBER" },
  PLZ: { de: "PLZ", en: "ZIP" },
  ORT: { de: "ORT", en: "CITY" },
  LAND: { de: "LAND", en: "COUNTRY" },
  KREDITKARTE: { de: "KREDITKARTE", en: "CREDIT CARD" },
  UEBERWEISUNG: { de: "ÜBERWEISUNG", en: "BANK TRANSFER" },
  BANK_TEXT_B2C: {
    de: "Bitte überweise den Betrag innerhalb von 5 Werktagen an:",
    en: "Please transfer the amount within 5 business days to:",
  },
  BANK_TEXT_WHOLESALE: {
    de: "Bitte überweise den Betrag innerhalb von 14 Tagen an:",
    en: "Please transfer the amount within 14 days to:",
  },
  BANK_HINT_WHOLESALE: {
    de: "Hinweis: Bei ausstehender Zahlung erhältst du automatische Erinnerungen nach 7, 12 und 13 Tagen. Nach 14 Tagen ohne Zahlungseingang wird die Bestellung automatisch storniert.",
    en: "Note: If payment is outstanding, you will receive automatic reminders on days 7, 12 and 13. After 14 days without payment, the order will be cancelled automatically.",
  },

  // Order success page
  ORDER_SUCCESS_NONE: { de: "Keine Bestellung gefunden.", en: "No order found." },
  ORDER_SUCCESS_PAYMENT_PROCESSING_TITLE: {
    de: "ZAHLUNG WIRD VERARBEITET",
    en: "PAYMENT PROCESSING",
  },
  ORDER_SUCCESS_PAYMENT_PROCESSING_BODY: {
    de: "Deine Zahlung wird noch verarbeitet. Du erhältst eine Bestätigungs-E-Mail sobald die Zahlung abgeschlossen ist.",
    en: "Your payment is still being processed. You will receive a confirmation email once payment is complete.",
  },
  ORDER_SUCCESS_PAYMENT_FAILED_TITLE: {
    de: "ZAHLUNG FEHLGESCHLAGEN",
    en: "PAYMENT FAILED",
  },
  ORDER_SUCCESS_PAYMENT_FAILED_BODY: {
    de: "Die Zahlung ist fehlgeschlagen. Bitte versuche es erneut.",
    en: "Payment failed. Please try again.",
  },
  ORDER_SUCCESS_LOAD_FAILED: {
    de: "Bestellung konnte nicht geladen werden.",
    en: "Order could not be loaded.",
  },
  ORDER_SUCCESS_RETRY: { de: "ERNEUT VERSUCHEN", en: "TRY AGAIN" },
  ORDER_SUCCESS_BACK_TO_SHOP: { de: "ZURÜCK ZUM SHOP", en: "BACK TO SHOP" },
  ORDER_SUCCESS_BANK_TITLE: { de: "BESTELLUNG EINGEGANGEN", en: "ORDER RECEIVED" },
  ORDER_SUCCESS_BANK_THANKS: {
    de: "Vielen Dank! Deine Bestellung{{order}} wurde erfasst.",
    en: "Thank you! Your order{{order}} has been received.",
  },
  ORDER_SUCCESS_TITLE: { de: "BESTELLUNG ERFOLGREICH", en: "ORDER SUCCESSFUL" },
  ORDER_SUCCESS_PAID_THANKS: {
    de: "Vielen Dank für deine Bestellung! Du erhältst eine Bestätigungs-E-Mail",
    en: "Thank you for your order! You will receive a confirmation email",
  },
  ORDER_SUCCESS_PAID_THANKS_AT: { de: "an", en: "at" },
  ORDER_SUCCESS_SUMMARY: { de: "ZUSAMMENFASSUNG", en: "SUMMARY" },
  ORDER_SUCCESS_WHOLESALE_SHIPPING: {
    de: "WHOLESALE-VERSAND",
    en: "WHOLESALE SHIPPING",
  },
  ORDER_SUCCESS_SHIPPING_DEFAULT: { de: "VERSAND", en: "SHIPPING" },

  // Bank order confirmation email (Resend)
  EMAIL_ORDER_CONFIRMATION: { de: "Bestellbestätigung", en: "Order confirmation" },
  EMAIL_BANK_SUBJECT: {
    de: "Deine Bestellung bei UncutTV – Zahlungsdetails",
    en: "Your UncutTV order – payment details",
  },
  EMAIL_BANK_GREETING: {
    de: "Hallo {{name}},<br/><br/>vielen Dank für deine Bestellung <strong style=\"color:#fff;\">#{{order}}</strong>.",
    en: "Hello {{name}},<br/><br/>Thank you for your order <strong style=\"color:#fff;\">#{{order}}</strong>.",
  },
  EMAIL_ORDER_OVERVIEW: { de: "Bestellübersicht", en: "Order summary" },
  EMAIL_FOOTER_AFTER_PAYMENT: {
    de: "Nach Zahlungseingang wird deine Bestellung umgehend versendet. Bei Fragen kontaktiere uns unter",
    en: "Your order will be shipped as soon as we receive your payment. If you have any questions, contact us at",
  },
  EMAIL_ACCOUNT_HOLDER: { de: "Kontoinhaber:", en: "Account holder:" },
  EMAIL_BANK_LABEL: { de: "Bank:", en: "Bank:" },
  EMAIL_PAYMENT_REFERENCE: { de: "Verwendungszweck:", en: "Payment reference:" },
  EMAIL_ORDER_REFERENCE_VALUE: {
    de: "Bestellung #{{order}}",
    en: "Order #{{order}}",
  },

  ZWISCHENSUMME: { de: "Zwischensumme", en: "Subtotal" },
  RABATT: { de: "Rabatt", en: "Discount" },
  SSL_HINWEIS: { de: "Sichere SSL-Verschlüsselung", en: "Secure SSL encryption" },
  CHECKOUT_PROVINZ: { de: "PROVINZ", en: "STATE / PROVINCE" },
  CHECKOUT_FIRMA_OPTIONAL: { de: "(optional)", en: "(optional)" },
  CHECKOUT_UID_LABEL: { de: "UID-NR.", en: "VAT ID" },
  CHECKOUT_PLACEHOLDER_EMAIL: { de: "deine@email.com", en: "your@email.com" },
  CHECKOUT_PLACEHOLDER_FIRST: { de: "Max", en: "Alex" },
  CHECKOUT_PLACEHOLDER_LAST: { de: "Mustermann", en: "Smith" },
  CHECKOUT_PLACEHOLDER_STREET: { de: "Musterstraße 1", en: "123 Main St" },
  CHECKOUT_PLACEHOLDER_ZIP: { de: "6020", en: "Postal code" },
  CHECKOUT_PLACEHOLDER_CITY: { de: "Innsbruck", en: "City" },
  CHECKOUT_PLACEHOLDER_COMPANY: { de: "z. B. Muster GmbH", en: "e.g. Example Ltd" },
  CHECKOUT_PLACEHOLDER_UID: { de: "ATU12345678", en: "ATU12345678" },
  CHECKOUT_PROVINCE_LOADING: {
    de: "Provinzen werden geladen …",
    en: "Loading provinces…",
  },
  CHECKOUT_SELECT_PLACEHOLDER: { de: "Bitte wählen …", en: "Please select…" },
  CHECKOUT_VERSANDART: { de: "VERSANDART", en: "SHIPPING METHOD" },
  CHECKOUT_EPS_TRANSFER: { de: "EPS-ÜBERWEISUNG", en: "EPS BANK TRANSFER" },
  CHECKOUT_KLARNA_REDIRECT: {
    de: "Du wirst nach dem Absenden zur Klarna-Zahlung weitergeleitet.",
    en: "You will be redirected to Klarna to complete payment after submitting.",
  },
  CHECKOUT_EPS_REDIRECT: {
    de: "Du wirst nach dem Absenden zur EPS-Zahlung weitergeleitet.",
    en: "You will be redirected to EPS to complete payment after submitting.",
  },
  CHECKOUT_PAYPAL_UNAVAILABLE: {
    de: "PayPal ist derzeit nicht verfügbar.",
    en: "PayPal is currently unavailable.",
  },
  CHECKOUT_PAYPAL_FAILED: {
    de: "PayPal-Zahlung fehlgeschlagen. Bitte versuche es erneut.",
    en: "PayPal payment failed. Please try again.",
  },
  CHECKOUT_PAYPAL_WHOLESALE_BLOCKED: {
    de: "Bitte Firmenname und gültige UID eingeben.",
    en: "Please enter company name and a valid VAT ID.",
  },
  CHECKOUT_COUPON_ACTIVE_TITLE: {
    de: "10% Rabattcode {{code}} aktiv",
    en: "10% discount code {{code}} active",
  },
  CHECKOUT_COUPON_ACTIVE_SUB: {
    de: "Dein Rabatt wird beim Bezahlen abgezogen",
    en: "Your discount is applied at checkout",
  },
  CHECKOUT_NEWSLETTER_SPAREN: { de: "10% SPAREN", en: "SAVE 10%" },
  CHECKOUT_NEWSLETTER_OPTIN: {
    de: "— Newsletter abonnieren & persönlichen Rabattcode sofort erhalten",
    en: "— Subscribe to the newsletter & get your personal discount code instantly",
  },
  CHECKOUT_NEWSLETTER_ALREADY: {
    de: "Du bist bereits für den Newsletter angemeldet.",
    en: "You are already subscribed to the newsletter.",
  },
  CHECKOUT_QUANTITY: { de: "Menge: {{qty}}", en: "Qty: {{qty}}" },
  CHECKOUT_INVALID_COUPON: { de: "Ungültiger Code.", en: "Invalid code." },
  CHECKOUT_COUPON_VALIDATE_ERROR: {
    de: "Fehler bei der Überprüfung.",
    en: "Could not validate code.",
  },
  CHECKOUT_SUBTOTAL_NET: { de: "Zwischensumme (netto)", en: "Subtotal (net)" },
  CHECKOUT_SHIPPING_NET: { de: "Versand (netto)", en: "Shipping (net)" },
  CHECKOUT_VAT: { de: "USt.", en: "VAT" },
  CHECKOUT_SHIPPING_LINE: { de: "Versand", en: "Shipping" },
  CHECKOUT_DISCOUNT_LABEL: { de: "Rabatt ({{discount}})", en: "Discount ({{discount}})" },
  CHECKOUT_TOTAL_GROSS: { de: "GESAMT (brutto)", en: "TOTAL (incl. VAT)" },
  CHECKOUT_SHIPPING_CALCULATING: { de: "wird berechnet…", en: "calculating…" },
  CHECKOUT_SHIPPING_UNAVAILABLE: {
    de: "Versand nicht verfügbar",
    en: "Shipping not available",
  },
  CHECKOUT_FREE_SHIPPING: { de: "Kostenlos", en: "Free" },
  CHECKOUT_SHIPPING_FOOTER: {
    de: "Versand per WooCommerce-Store-API (bzw. pauschal für Wholesale).",
    en: "Shipping via WooCommerce Store API (or flat rate for wholesale).",
  },
  CHECKOUT_ERROR_COUNTRY_BLOCKED: {
    de: "Versand in dieses Land ist derzeit nicht möglich.",
    en: "Shipping to this country is not available.",
  },
  CHECKOUT_ERROR_WHOLESALE_EU_ONLY: {
    de: "Wholesale-Bestellungen sind nur innerhalb der EU möglich.",
    en: "Wholesale orders are only available within the EU.",
  },
  CHECKOUT_ERROR_SHIPPING_UNAVAILABLE: {
    de: "Versand konnte nicht berechnet werden — bitte Land prüfen",
    en: "Could not calculate shipping — please check your country",
  },
  CHECKOUT_ERROR_SHIPPING_PROVINCE: {
    de: "Provinz wählen, um Versand zu berechnen.",
    en: "Select a state/province to calculate shipping.",
  },
  CHECKOUT_ERROR_PAYMENT_INTENT: {
    de: "Zahlungsaufbau fehlgeschlagen.",
    en: "Could not set up payment.",
  },
  CHECKOUT_ERROR_COMPANY_REQUIRED: {
    de: "Bitte Firmennamen angeben.",
    en: "Please enter your company name.",
  },
  CHECKOUT_ERROR_UID_REQUIRED: {
    de: "Bitte gültige UID-Nr. eingeben.",
    en: "Please enter a valid VAT ID.",
  },
  CHECKOUT_VALIDATION_UID_FORMAT: {
    de: "UID-Format ungültig — Beispiel: ATU12345678",
    en: "Invalid VAT ID format — example: ATU12345678",
  },
  CHECKOUT_VALIDATION_UID_REQUIRED: {
    de: "UID ist erforderlich.",
    en: "VAT ID is required.",
  },
  CHECKOUT_ERROR_SHIPPING_BLOCKED: {
    de: "Versand: Bitte warten oder Lieferland prüfen — Bestellung noch nicht möglich.",
    en: "Shipping: please wait or check delivery country — order not possible yet.",
  },
  CHECKOUT_ERROR_CARD_ELEMENT: {
    de: "Kartenelement nicht gefunden.",
    en: "Card field not found.",
  },
  CHECKOUT_ERROR_PAYMENT_PREP_FAILED: {
    de: "Vorbereitung der Zahlung fehlgeschlagen — bitte erneut versuchen.",
    en: "Payment setup failed — please try again.",
  },
  CHECKOUT_ERROR_PAYMENT_SETUP: {
    de: "Zahlungsaufbau fehlerhaft — bitte Seite neu laden.",
    en: "Payment setup error — please reload the page.",
  },
  CHECKOUT_ERROR_PAYMENT_FAILED: {
    de: "Zahlung fehlgeschlagen.",
    en: "Payment failed.",
  },
  CHECKOUT_ERROR_ORDER_FAILED: {
    de: "Bestellung fehlgeschlagen.",
    en: "Order failed.",
  },
  CHECKOUT_ERROR_CONNECTION: {
    de: "Verbindungsfehler. Bitte versuche es erneut.",
    en: "Connection error. Please try again.",
  },
  CHECKOUT_PAYPAL_ORDER_DESCRIPTION: {
    de: "UNCUTTV Shop Bestellung",
    en: "UNCUTTV shop order",
  },

  // Account
  MEINE_BESTELLUNGEN: { de: "MEINE BESTELLUNGEN", en: "MY ORDERS" },
  MEINE_DATEN: { de: "MEINE DATEN", en: "MY DETAILS" },
  ABMELDEN: { de: "ABMELDEN", en: "LOG OUT" },
  ANMELDEN: { de: "ANMELDEN", en: "SIGN IN" },
  REGISTRIEREN: { de: "REGISTRIEREN", en: "REGISTER" },
  KONTO_ERSTELLEN: { de: "KONTO ERSTELLEN", en: "CREATE ACCOUNT" },
  PASSWORT: { de: "PASSWORT", en: "PASSWORD" },
  PASSWORT_AENDERN: { de: "PASSWORT ÄNDERN", en: "CHANGE PASSWORD" },
  WILLKOMMEN: { de: "WILLKOMMEN", en: "WELCOME" },
  SPEICHERN: { de: "SPEICHERN", en: "SAVE" },
  BEARBEITEN: { de: "BEARBEITEN", en: "EDIT" },
  ABBRECHEN: { de: "ABBRECHEN", en: "CANCEL" },
  NOCH_KEINE_BESTELLUNGEN: { de: "Noch keine Bestellungen.", en: "No orders yet." },

  // Händler
  HAENDLERPORTAL: { de: "HÄNDLERPORTAL", en: "DEALER PORTAL" },
  HAENDLERPREIS: { de: "HÄNDLERPREIS", en: "DEALER PRICE" },
  BRANDNEU: { de: "BRANDNEU", en: "BRAND NEW" },
  ALLE_FILME: { de: "ALLE FILME", en: "ALL FILMS" },
  PREIS_ANFRAGEN: { de: "PREIS ANFRAGEN", en: "REQUEST PRICE" },
  ANFRAGE_SENDEN: { de: "ANFRAGE SENDEN", en: "SEND REQUEST" },

  // Status badges
  STATUS_VERARBEITUNG: { de: "VERARBEITUNG", en: "PROCESSING" },
  STATUS_ABGESCHLOSSEN: { de: "ABGESCHLOSSEN", en: "COMPLETED" },
  STATUS_AUSSTEHEND: { de: "AUSSTEHEND", en: "PENDING" },
  STATUS_WARTEND: { de: "WARTEND", en: "ON HOLD" },
  STATUS_STORNIERT: { de: "STORNIERT", en: "CANCELLED" },
  STATUS_ERSTATTET: { de: "ERSTATTET", en: "REFUNDED" },
  STATUS_FEHLGESCHLAGEN: { de: "FEHLGESCHLAGEN", en: "FAILED" },

  // General
  ZURUECK: { de: "ZURÜCK", en: "BACK" },
  ZURUECK_ZUM_SHOP: { de: "Zurück zum Shop", en: "Back to shop" },
  E_MAIL: { de: "E-MAIL", en: "EMAIL" },
  TELEFON: { de: "TELEFON", en: "PHONE" },
  FIRMA: { de: "FIRMA", en: "COMPANY" },
};

// WooCommerce category name translations
const categoryNames: Record<string, string> = {
  "Brandneu": "New",
  "Vorverkauf": "Pre-Order",
  "Jetzt erhältlich!": "Available Now",
  "Im Angebot und Bundles": "Deals & Bundles",
  "Out of Print": "Out of Print",
  "Underground Collection": "Underground Collection",
  "Filme": "Films",
};

// Product detail label translations
const detailLabels: Record<string, string> = {
  "Land": "Country",
  "Regie": "Director",
  "Genre": "Genre",
  "Jahr": "Year",
  "Laufzeit": "Runtime",
  "Verpackung": "Packaging",
  "Altersfreigabe": "Age Rating",
  "VÖ-Termin": "Release Date",
  "Limitierung": "Limited to",
  "Cast": "Cast",
  "Vorverkauf ab": "Pre-Order from",
  "Inhalt": "Content",
  "Beschreibung": "Description",
  "Bundle": "Bundle",
  "Produktion": "Production",
  "Technische Daten": "Technical Data",
  "Release": "Release",
  "Bild": "Video",
  "Ton": "Audio",
  "Untertitel": "Subtitles",
};

export function getTranslation(key: string, lang: "de" | "en"): string {
  return translations[key]?.[lang] || translations[key]?.de || key;
}

export function formatTranslation(
  key: string,
  lang: "de" | "en",
  vars: Record<string, string> = {}
): string {
  let text = getTranslation(key, lang);
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{{${name}}}`, value);
  }
  return text;
}

export function translateCategoryName(name: string, lang: "de" | "en"): string {
  if (lang === "de") return name;
  return categoryNames[name] || name;
}

export function translateDetailLabel(label: string, lang: "de" | "en"): string {
  if (lang === "de") return label;
  return detailLabels[label] || label;
}

// Hook-compatible function creator
export function createT(lang: "de" | "en") {
  return (key: string) => getTranslation(key, lang);
}
