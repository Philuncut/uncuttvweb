"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLanguage } from "@/lib/LanguageContext";
import { createT } from "@/lib/translations";
import SectionHeader from "@/components/blog/SectionHeader";
import type { WooProduct } from "@/lib/types";

const GRAIN_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`;

const POLAROIDS = [
  { src: "/about/flo_und_girl.jpg",   alt: "Set-Foto",          rotDeg: -3 },
  { src: "/about/flow_und_crew.jpg",  alt: "Crew vor Ort",      rotDeg:  2 },
  { src: "/about/phil_und_july.jpg",  alt: "Backstage",         rotDeg: -2 },
  { src: "/about/phil_und_simon.jpg", alt: "Mit dem Regisseur", rotDeg:  3 },
];

const POLAROID_CAPTIONS_DE = ["Set-Tag", "Mit der Crew", "Backstage", "Mit Simon"];
const POLAROID_CAPTIONS_EN = ["Set day", "With the crew", "Backstage", "With Simon"];

type Props = {
  newestProducts: WooProduct[];
};

export default function AboutClient({ newestProducts }: Props) {
  const { language } = useLanguage();
  const t = useMemo(() => createT(language), [language]);

  const [heroMounted, setHeroMounted] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setHeroMounted(true);
      return;
    }
    const id = requestAnimationFrame(() => setHeroMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const polaroidCaptions =
    language === "de" ? POLAROID_CAPTIONS_DE : POLAROID_CAPTIONS_EN;

  return (
    <div className="mx-auto max-w-5xl px-4 py-20 sm:py-28">
      <div className="space-y-20">

        {/* ── Section 0: Hero ──────────────────────────────────────────── */}
        <section>
          <div className="mb-6 flex items-center gap-3">
            <span
              className="h-0.5 bg-[#c0392b]"
              style={{
                width: heroMounted ? "48px" : "0px",
                transition: "width 800ms cubic-bezier(0.22, 1, 0.36, 1) 200ms",
              }}
              aria-hidden="true"
            />
            <span
              className="font-mono text-sm font-bold uppercase tracking-[0.3em] text-[#c0392b]"
              style={{
                opacity: heroMounted ? 1 : 0,
                transition: "opacity 600ms ease 400ms",
              }}
            >
              {t("ABOUT_HERO_EYEBROW")}
            </span>
          </div>
          <h1 className="mt-6 text-5xl font-black uppercase leading-[0.95] tracking-tight text-white sm:text-6xl md:text-7xl">
            {t("ABOUT_HERO_TITLE")}
          </h1>
          <p className="mt-6 max-w-2xl text-base text-white/60 sm:text-lg">
            {t("ABOUT_HERO_SUB")}
          </p>
        </section>

        {/* ── Section 1: Wie alles begann ──────────────────────────────── */}
        <section>
          <SectionHeader
            eyebrow={t("ABOUT_S1_EYEBROW")}
            title={t("ABOUT_S1_TITLE")}
          />
          <div className="max-w-3xl space-y-6 text-base leading-relaxed text-white/80 sm:text-lg">
            <p>{t("ABOUT_S1_P1")}</p>
            <p>{t("ABOUT_S1_P2")}</p>
            <p>{t("ABOUT_S1_P3")}</p>
          </div>
        </section>

        {/* ── Section 2: Vom Keller ins Headquarter ────────────────────── */}
        <section>
          <SectionHeader
            eyebrow={t("ABOUT_S2_EYEBROW")}
            title={t("ABOUT_S2_TITLE")}
          />
          <div className="max-w-3xl space-y-6 text-base leading-relaxed text-white/80 sm:text-lg">
            <p>{t("ABOUT_S2_P1")}</p>
            <p>{t("ABOUT_S2_P2")}</p>
          </div>
        </section>

        {/* ── Section 3: Persönlich — photo + text ─────────────────────── */}
        <section>
          <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-16">
            {/* Photo */}
            <div className="relative">
              <div className="relative aspect-[4/5] overflow-hidden border border-white/10">
                <Image
                  src="/about/flo_und_phil.jpg"
                  alt="Florian und Philipp"
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  unoptimized
                />
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-overlay"
                  style={{
                    backgroundImage: GRAIN_SVG,
                    backgroundRepeat: "repeat",
                    backgroundSize: "200px 200px",
                  }}
                />
              </div>
            </div>

            {/* Text */}
            <div>
              <div className="mb-4 flex items-center gap-4">
                <span className="h-0.5 w-20 bg-[#c0392b]" aria-hidden="true" />
                <span className="font-mono text-sm font-bold uppercase tracking-[0.3em] text-[#c0392b]">
                  {t("ABOUT_S3_EYEBROW")}
                </span>
              </div>
              <h2 className="mb-6 text-3xl font-bold uppercase tracking-tight text-white sm:text-4xl md:text-5xl">
                {t("ABOUT_S3_TITLE")}
              </h2>
              <div className="space-y-5 text-base leading-relaxed text-white/80 sm:text-lg">
                <p>{t("ABOUT_S3_P1")}</p>
                <p>{t("ABOUT_S3_P2")}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 4: Hinter der Kamera — Polaroids ─────────────────── */}
        <section>
          <SectionHeader
            eyebrow={t("ABOUT_S4_EYEBROW")}
            title={t("ABOUT_S4_TITLE")}
          />
          <div className="max-w-3xl space-y-6 text-base leading-relaxed text-white/80 sm:text-lg">
            <p>{t("ABOUT_S4_P1")}</p>
            <p>{t("ABOUT_S4_P2")}</p>
          </div>

          {/* Polaroid strip */}
          <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-4 md:gap-6">
            {POLAROIDS.map((img, i) => (
              <PolaroidCard
                key={img.src}
                src={img.src}
                alt={img.alt}
                caption={polaroidCaptions[i]}
                rotDeg={img.rotDeg}
              />
            ))}
          </div>

          {/* CTA */}
          <div className="mt-16 flex justify-start">
            <Link
              href="/shop/vermaehlung-im-blut-mediabook-cover-b"
              className="group inline-flex items-center gap-3 border border-white/15 bg-transparent px-8 py-4 text-sm font-bold uppercase tracking-widest text-white transition hover:border-[#c0392b] hover:bg-[#c0392b]"
            >
              <span>{t("ABOUT_S4_CTA")}</span>
              <svg
                className="h-4 w-4 transition group-hover:translate-x-1"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </div>
        </section>

        {/* ── Section 5: Für Filmemacher ───────────────────────────────── */}
        <section>
          <SectionHeader
            eyebrow={t("ABOUT_S5_EYEBROW")}
            title={t("ABOUT_S5_TITLE")}
          />
          <div className="max-w-3xl text-base leading-relaxed text-white/80 sm:text-lg">
            <p>{t("ABOUT_S5_P1")}</p>
          </div>
          <div className="mt-8">
            <a
              href="mailto:office@uncuttv.at"
              className="group inline-flex items-center gap-3 border border-[#c0392b] bg-[#c0392b] px-8 py-4 text-sm font-bold uppercase tracking-widest text-white transition hover:bg-[#a93226]"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span>office@uncuttv.at</span>
            </a>
          </div>
        </section>

        {/* ── Section 6: Archiv-Block ───────────────────────────────────── */}
        {newestProducts.length > 0 && (
          <section>
            <SectionHeader
              eyebrow={t("ABOUT_S6_EYEBROW")}
              title={t("ABOUT_S6_TITLE")}
            />
            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
              {newestProducts.map((p) => (
                <Link
                  key={p.id}
                  href={`/shop/${p.slug}`}
                  className="group relative block overflow-hidden border border-white/10 bg-black/40 transition hover:border-[#c0392b]/40"
                >
                  <div className="relative aspect-square overflow-hidden">
                    <Image
                      src={p.images[0]?.src ?? "/placeholder.jpg"}
                      alt={p.name}
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
                  </div>
                </Link>
              ))}
            </div>
            <div className="mt-10 flex justify-start">
              <Link
                href="/shop"
                className="group inline-flex items-center gap-3 border border-white/15 bg-transparent px-8 py-4 text-sm font-bold uppercase tracking-widest text-white transition hover:border-[#c0392b] hover:bg-[#c0392b]"
              >
                <span>{t("ABOUT_S6_CTA")}</span>
                <svg
                  className="h-4 w-4 transition group-hover:translate-x-1"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
            </div>
          </section>
        )}

        {/* ── Section 7: Danke ─────────────────────────────────────────── */}
        <section className="border-t border-white/10 pt-20">
          <SectionHeader
            eyebrow={t("ABOUT_S7_EYEBROW")}
            title={t("ABOUT_S7_TITLE")}
          />
          <div className="max-w-3xl space-y-6 text-base leading-relaxed text-white/80 sm:text-lg">
            <p>{t("ABOUT_S7_P1")}</p>
            <p>{t("ABOUT_S7_P2")}</p>
          </div>
        </section>

      </div>
    </div>
  );
}

// ── Polaroid card ─────────────────────────────────────────────────────────────

function PolaroidCard({
  src,
  alt,
  caption,
  rotDeg,
}: {
  src: string;
  alt: string;
  caption: string;
  rotDeg: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="group relative bg-[#f5f0e8] p-3 pb-12 shadow-2xl transition-transform duration-300 hover:scale-[1.03]"
      style={{
        transform: `rotate(${rotDeg}deg)`,
        opacity: visible ? 1 : 0,
        transition: "opacity 500ms ease, transform 300ms ease",
      }}
    >
      <div className="relative aspect-square overflow-hidden bg-black">
        <Image
          src={src}
          alt={alt}
          fill
          className="object-cover [filter:grayscale(0.15)_sepia(0.05)]"
          sizes="(max-width: 768px) 100vw, 25vw"
          unoptimized
        />
      </div>
      <p className="absolute bottom-3 left-0 right-0 text-center font-mono text-xs italic text-black/60">
        {caption}
      </p>
    </div>
  );
}
