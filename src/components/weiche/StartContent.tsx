"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLanguage } from "@/lib/LanguageContext";
import { createT } from "@/lib/translations";
import { formatPrice } from "@/lib/format-price";
import type { ShopListProduct } from "@/lib/types";

/**
 * Der lesbare Teil unter der Weiche: was der Verbund ist, die drei Wege als
 * Textlinks und die neuesten Produkte aus dem Shop. Die Weiche selbst
 * besteht aus Videos und Logos; erst hier steht Text, den Suchmaschinen
 * und Vorleseprogramme verwerten können.
 *
 * Clientkomponente wie AboutClient: Die Sprache liegt nur im Browser
 * (LanguageContext). Der Server rendert Deutsch, nach der Hydration
 * schaltet die Seite um.
 */

const WEGE = [
  { key: "STREAMING", href: "https://uncuttv.app", extern: true },
  { key: "SHOP", href: "/shop", extern: false },
  { key: "SOCIAL", href: "https://tv.uncuttv.at", extern: true },
] as const;

export default function StartContent({ products }: { products: ShopListProduct[] }) {
  const { language } = useLanguage();
  const t = useMemo(() => createT(language), [language]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
      <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#c0392b]">
        {t("START_EYEBROW")}
      </p>
      <h1 className="mt-4 text-3xl font-black uppercase tracking-tight text-white sm:text-5xl">
        {t("START_TITLE")}
      </h1>
      <p className="mt-6 max-w-3xl text-base leading-relaxed text-white/70 sm:text-lg">
        {t("START_TEXT_1")}
      </p>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-white/70 sm:text-lg">
        {t("START_TEXT_2")}
      </p>

      <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {WEGE.map((weg) => {
          const inhalt = (
            <>
              <span className="block text-sm font-bold uppercase tracking-widest text-white">
                {t(`START_WEG_${weg.key}_TITEL`)}
              </span>
              <span className="mt-2 block text-sm text-white/60">
                {t(`START_WEG_${weg.key}_TEXT`)}
              </span>
            </>
          );
          const klasse =
            "block border border-white/10 bg-black/40 p-5 transition hover:border-[#c0392b]/60";
          return (
            <li key={weg.key}>
              {weg.extern ? (
                <a href={weg.href} className={klasse} rel="noopener">
                  {inhalt}
                </a>
              ) : (
                <Link href={weg.href} className={klasse}>
                  {inhalt}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {products.length > 0 && (
        <section className="mt-20">
          <h2 className="text-xl font-black uppercase tracking-[0.15em] text-white sm:text-2xl">
            {t("START_PRODUCTS_TITLE")}
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {products.map((p) => {
              const preis = Number(p.price);
              return (
                <Link
                  key={p.id}
                  href={`/shop/${p.slug}`}
                  className="group block overflow-hidden border border-white/10 bg-black/40 transition hover:border-[#c0392b]/40"
                >
                  <div className="relative aspect-square overflow-hidden">
                    <Image
                      src={p.images[0]?.src ?? "/placeholder.jpg"}
                      alt={p.images[0]?.alt || p.name}
                      fill
                      className="object-cover transition duration-500 group-hover:scale-105"
                      sizes="(max-width: 640px) 100vw, 33vw"
                      unoptimized
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="line-clamp-2 text-sm font-bold uppercase tracking-tight text-white">
                      {p.name}
                    </h3>
                    {Number.isFinite(preis) && preis > 0 && (
                      <p className="mt-1 text-sm text-white/60">{formatPrice(preis)}</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="mt-8">
            <Link
              href="/shop"
              className="inline-flex items-center gap-3 border border-white/15 px-8 py-4 text-sm font-bold uppercase tracking-widest text-white transition hover:border-[#c0392b] hover:bg-[#c0392b]"
            >
              {t("START_PRODUCTS_CTA")}
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
