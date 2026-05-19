import type { MetadataRoute } from "next";
import { wooFetchAll } from "@/lib/woocommerce";
import { SITE_URL } from "@/lib/product-seo";

export const revalidate = 3600;

type WooProductSitemapRow = {
  slug: string;
  date_modified?: string;
};

const STATIC_PAGES: Array<{
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}> = [
  { path: "", priority: 1.0, changeFrequency: "weekly" },
  { path: "/shop", priority: 1.0, changeFrequency: "weekly" },
  { path: "/blog", priority: 0.7, changeFrequency: "weekly" },
  { path: "/about", priority: 0.3, changeFrequency: "monthly" },
  { path: "/impressum", priority: 0.3, changeFrequency: "monthly" },
  { path: "/datenschutz", priority: 0.3, changeFrequency: "monthly" },
  { path: "/rueckerstattung", priority: 0.3, changeFrequency: "monthly" },
  { path: "/kontakt", priority: 0.3, changeFrequency: "monthly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_PAGES.map(
    ({ path, priority, changeFrequency }) => ({
      url: `${SITE_URL}${path || "/"}`,
      lastModified: new Date(),
      changeFrequency,
      priority,
    })
  );

  let productEntries: MetadataRoute.Sitemap = [];
  try {
    const products = await wooFetchAll<WooProductSitemapRow>(
      "/products",
      { per_page: "100", status: "publish" },
      { revalidate: 3600 }
    );

    productEntries = products
      .filter((p) => p.slug)
      .map((product) => ({
        url: `${SITE_URL}/shop/${product.slug}`,
        lastModified: product.date_modified
          ? new Date(product.date_modified)
          : new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));
  } catch {
    productEntries = [];
  }

  return [...staticEntries, ...productEntries];
}
