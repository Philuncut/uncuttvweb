import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/product-seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/konto/",
          "/haendler/",
          "/checkout",
          "/bestellung/",
          "/_next/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
