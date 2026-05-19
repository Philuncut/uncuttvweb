import type { Metadata } from "next";
import type { WooProduct } from "@/lib/types";
import { HAENDLER_OUT_OF_PRINT_CATEGORY_SLUGS } from "@/lib/haendler-filter";
import { parsePrice } from "@/lib/parse-price";
import { formatPrice } from "@/lib/format-price";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://uncuttv.at";

export type ProductSeoStatus = "vorverkauf" | "outofprint" | "sale" | "instock";

export type WooProductSeo = WooProduct & {
  meta_data?: Array<{ key: string; value: unknown }>;
};

const DESCRIPTION_MAX_LENGTH = 155;
const DESCRIPTION_MIN_USEFUL = 50;

const PRODUCT_TITLE_TEMPLATES = {
  vorverkauf: (name: string, releaseDate?: string) =>
    releaseDate
      ? `${name} - Vorverkauf ${releaseDate} | UncutTV`
      : `${name} - Jetzt vorbestellen | UncutTV`,
  outofprint: (name: string) => `${name} - Out of Print | UncutTV`,
  sale: (name: string) => `${name} - Sale Angebot | UncutTV`,
  instock: (name: string, limitation?: string) => {
    if (limitation) {
      return `${name} - Limited ${limitation} Stück | UncutTV`;
    }
    const suffix = /\bbundle\b/i.test(name)
      ? " - Limited Edition | UncutTV"
      : " - Limited Edition Mediabook | UncutTV";
    return `${name}${suffix}`;
  },
} as const;

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateWithEllipsis(text: string, maxLength: number): string {
  const normalized = text.trim();
  if (normalized.length <= maxLength) return normalized;
  if (maxLength <= 3) return normalized.slice(0, maxLength);
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function categorySlugs(product: WooProductSeo): string[] {
  return (product.categories ?? []).map((c) =>
    String(c.slug ?? "").toLowerCase()
  );
}

export function detectProductStatus(product: WooProductSeo): ProductSeoStatus {
  const slugs = categorySlugs(product);

  if (slugs.some((s) => s.includes("vorverkauf"))) return "vorverkauf";

  if (
    slugs.some((s) =>
      HAENDLER_OUT_OF_PRINT_CATEGORY_SLUGS.some(
        (oop) => s === oop || s.includes(oop)
      )
    )
  ) {
    return "outofprint";
  }

  if (product.stock_status === "outofstock") return "outofprint";
  if (product.on_sale === true) return "sale";
  return "instock";
}

export function extractLimitationFromName(name: string): string | undefined {
  const patterns = [
    /\blimit(?:ed|ierung)?\s*(?:auf\s*)?(\d{1,5})\b/i,
    /\b(\d{1,5})\s*st[uü]ck\b/i,
    /\bauflage\s*(\d{1,5})\b/i,
  ];
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

export function extractFromMeta(
  meta: Array<{ key: string; value: unknown }> | undefined,
  ...keys: string[]
): string | undefined {
  if (!meta?.length) return undefined;
  const normalizedKeys = new Set(keys.map((k) => k.toLowerCase()));
  for (const row of meta) {
    const key = String(row.key ?? "").toLowerCase();
    if (!normalizedKeys.has(key)) continue;
    const v = row.value;
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

export function extractReleaseDateFromMeta(
  meta: Array<{ key: string; value: unknown }> | undefined
): string | undefined {
  return extractFromMeta(
    meta,
    "release_date",
    "_release_date",
    "vorverkauf_datum",
    "_vorverkauf_datum",
    "veroeffentlichung",
    "_veroeffentlichung"
  );
}

function displayPriceEuro(product: WooProduct): string {
  const amount =
    product.on_sale && product.sale_price
      ? parsePrice(product.sale_price)
      : parsePrice(product.price || product.regular_price);
  return formatPrice(amount).replace(/\s*€$/, "€");
}

export function buildProductTitle(product: WooProductSeo): string {
  const status = detectProductStatus(product);
  const limitation =
    extractLimitationFromName(product.name) ??
    extractFromMeta(product.meta_data, "auflage", "_auflage", "limitierung", "_limitierung");
  const releaseDate = extractReleaseDateFromMeta(product.meta_data);

  const templateArg =
    status === "vorverkauf"
      ? releaseDate
      : status === "instock"
        ? limitation
        : undefined;

  return PRODUCT_TITLE_TEMPLATES[status](product.name, templateArg);
}

function buildDescriptionFallback(
  product: WooProductSeo,
  status: ProductSeoStatus
): string {
  const name = product.name;
  const price = displayPriceEuro(product);
  const regular = displayPriceEuro({
    ...product,
    on_sale: false,
    sale_price: "",
    price: product.regular_price || product.price,
  });

  switch (status) {
    case "vorverkauf":
      return `${name} jetzt vorbestellen im UncutTV Shop. Limited Edition Mediabook, Cover-Variante, Vorverkauf ab ${price}.`;
    case "outofprint":
      return `${name} - vergriffenes Mediabook im UncutTV Shop. Letzte Restbestände der limitierten Edition, nicht mehr nachproduziert.`;
    case "sale":
      return `${name} im Sale - jetzt ${price} statt ${regular}. Limited Edition Mediabook im UncutTV Shop.`;
    default:
      return `${name} - limitiertes Mediabook im offiziellen UncutTV Shop. Jetzt für ${price} bestellen, sofort lieferbar.`;
  }
}

export function buildProductDescription(product: WooProductSeo): string {
  const shortClean = stripHtml(product.short_description || "");
  if (shortClean.length >= DESCRIPTION_MIN_USEFUL) {
    return truncateWithEllipsis(shortClean, DESCRIPTION_MAX_LENGTH);
  }

  const longClean = stripHtml(product.description || "");
  if (longClean.length >= DESCRIPTION_MIN_USEFUL) {
    return truncateWithEllipsis(longClean, DESCRIPTION_MAX_LENGTH);
  }

  return truncateWithEllipsis(
    buildDescriptionFallback(product, detectProductStatus(product)),
    DESCRIPTION_MAX_LENGTH
  );
}

export function productCanonicalUrl(slug: string): string {
  return `${SITE_URL}/shop/${slug}`;
}

/**
 * og:type "product" for WooCommerce PDPs — see `ProductOgTypeMeta` in
 * src/app/shop/[slug]/page.tsx.
 *
 * Next.js 16 `OpenGraphType` has no "product" (only website, article, video.*, …).
 * `metadata.other` renders `<meta name="…">`, not `property="og:…"`.
 * `openGraph.type: "product"` is invalid for TypeScript and would not match the
 * runtime switch in next/dist/lib/metadata/metadata.js (no product case).
 *
 * Fix: omit `openGraph.type` in buildProductMetadata; PDP route renders
 * `<meta property="og:type" content="product" />` (hoisted to <head> by React 19).
 */

export function buildProductMetadata(product: WooProductSeo): Metadata {
  const title = buildProductTitle(product);
  const description = buildProductDescription(product);
  const canonical = productCanonicalUrl(product.slug);
  const image = product.images[0]?.src;
  const primaryImage = product.images[0];

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "UncutTV",
      // og:type "product" via ProductOgTypeMeta (see comment above)
      ...(image
        ? {
            images: [
              {
                url: image,
                alt: primaryImage?.alt || product.name,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

function schemaAvailability(
  product: WooProductSeo,
  status: ProductSeoStatus
): string {
  if (status === "vorverkauf" || product.stock_status === "onbackorder") {
    return "https://schema.org/PreOrder";
  }
  if (product.stock_status === "outofstock" || status === "outofprint") {
    return "https://schema.org/OutOfStock";
  }
  return "https://schema.org/InStock";
}

export function buildProductJsonLd(product: WooProductSeo): Record<string, unknown> {
  const status = detectProductStatus(product);
  const description =
    stripHtml(product.short_description || "") ||
    stripHtml(product.description || "") ||
    buildDescriptionFallback(product, status);
  const price =
    product.on_sale && product.sale_price
      ? product.sale_price
      : product.price || product.regular_price;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: product.images.map((img) => img.src).filter(Boolean),
    description: truncateWithEllipsis(description, 500),
    sku: product.sku || undefined,
    brand: {
      "@type": "Brand",
      name: "UncutTV",
    },
    offers: {
      "@type": "Offer",
      url: productCanonicalUrl(product.slug),
      priceCurrency: "EUR",
      price,
      availability: schemaAvailability(product, status),
      itemCondition: "https://schema.org/NewCondition",
    },
  };
}
