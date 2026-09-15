import type { NextConfig } from "next";

type RedirectRule = {
  source: string;
  destination: string;
  permanent: true;
};

/** WordPress had trailing slashes; Next.js uses paths without. */
function redirectBoth(
  source: string,
  destination: string,
): RedirectRule[] {
  const base = source.replace(/\/$/, "");
  return [
    { source: base, destination, permanent: true },
    { source: `${base}/`, destination, permanent: true },
  ];
}

/** Only the trailing-slash variant (path without slash is already correct). */
function redirectTrailingOnly(
  source: string,
  destination: string,
): RedirectRule {
  const base = source.replace(/\/$/, "");
  return { source: `${base}/`, destination, permanent: true };
}

/**
 * Startseite → Shop. Vorher stand das als redirect() in src/app/page.tsx
 * und lief damit als Serverfunktion mit eigenem Rundlauf (gemessen
 * 0,28 s). Als Konfigurationsregel wird es am Edge beantwortet.
 * Abfrageparameter (UTM, Kampagnen) reicht Next bei redirects durch.
 * 307 wie bisher, damit Browser die Umleitung nicht dauerhaft merken.
 */
const homeRedirect = {
  source: "/",
  destination: "/shop",
  permanent: false,
} as const;

const wordpressMigrationRedirects: RedirectRule[] = [
  // --- Section 4: static pages (specific before generic patterns) ---
  ...redirectBoth("/privacy-policy", "/datenschutz"),
  redirectTrailingOnly("/shop", "/shop"),
  ...redirectBoth("/warenkorb", "/shop"),
  ...redirectBoth("/kasse", "/checkout"),
  ...redirectBoth("/mein-konto", "/konto"),
  ...redirectBoth("/rueckerstattung_rueckgaben", "/rueckerstattung"),
  redirectTrailingOnly("/impressum", "/impressum"),
  ...redirectBoth("/anmelden", "/konto/login"),
  ...redirectBoth("/passwort-zuruecksetzen", "/passwort-vergessen"),
  ...redirectBoth("/registrieren", "/konto/login"),
  redirectTrailingOnly("/konto", "/konto"),
  ...redirectBoth("/profil", "/konto"),
  ...redirectBoth("/ueber-uns", "/about"),
  ...redirectBoth("/archiv", "/shop"),
  redirectTrailingOnly("/blog", "/blog"),

  // --- Section 2: product categories → /shop ---
  {
    source: "/produkt-kategorie/:slug",
    destination: "/shop",
    permanent: true,
  },
  {
    source: "/produkt-kategorie/:slug/",
    destination: "/shop",
    permanent: true,
  },

  // --- Section 1: products → /shop/:slug ---
  {
    source: "/produkt/:slug",
    destination: "/shop/:slug",
    permanent: true,
  },
  {
    source: "/produkt/:slug/",
    destination: "/shop/:slug",
    permanent: true,
  },

  // --- Section 3: blog categories → /blog ---
  {
    source: "/category/:slug",
    destination: "/blog",
    permanent: true,
  },
  {
    source: "/category/:slug/",
    destination: "/blog",
    permanent: true,
  },

  // --- Trailing-slash normalization for Next.js routes (skipTrailingSlashRedirect) ---
  redirectTrailingOnly("/checkout", "/checkout"),
  redirectTrailingOnly("/about", "/about"),
  redirectTrailingOnly("/datenschutz", "/datenschutz"),
  redirectTrailingOnly("/rueckerstattung", "/rueckerstattung"),
  redirectTrailingOnly("/passwort-vergessen", "/passwort-vergessen"),
  redirectTrailingOnly("/kontakt", "/kontakt"),
  redirectTrailingOnly("/haendler", "/haendler"),
  redirectTrailingOnly("/haendler/dashboard", "/haendler/dashboard"),
  redirectTrailingOnly("/haendler/anfrage", "/haendler/anfrage"),
  redirectTrailingOnly("/bestellung/erfolg", "/bestellung/erfolg"),
  redirectTrailingOnly("/konto/login", "/konto/login"),
  redirectTrailingOnly("/konto/dashboard", "/konto/dashboard"),
  redirectTrailingOnly("/start", "/start"),
];

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  // @philuncut/universe wird als Quelltext (TS/TSX) ausgeliefert und muss
  // von Next mitübersetzt werden.
  transpilePackages: ["@philuncut/universe"],

  // Entwicklungsserver vom Handy im lokalen Netz aufrufen (Touch-Tests).
  allowedDevOrigins: ["192.168.0.108"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "uncuttv.at",
      },
      // Produktbilder liegen bei WordPress; ohne diesen Eintrag kann
      // next/image sie nicht skalieren und der Shop lud die Originale.
      {
        protocol: "https",
        hostname: "wp.uncuttv.at",
      },
    ],
  },
  async redirects() {
    return [homeRedirect, ...wordpressMigrationRedirects];
  },
};

export default nextConfig;
