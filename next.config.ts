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
];

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "uncuttv.at",
      },
    ],
  },
  async redirects() {
    return wordpressMigrationRedirects;
  },
};

export default nextConfig;
