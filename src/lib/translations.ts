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
  ZWISCHENSUMME: { de: "Zwischensumme", en: "Subtotal" },
  RABATT: { de: "Rabatt", en: "Discount" },
  SSL_HINWEIS: { de: "Sichere SSL-Verschlüsselung", en: "Secure SSL encryption" },

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
