"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Caveat } from "next/font/google";
import { useLanguage } from "@/lib/LanguageContext";
import { createT } from "@/lib/translations";
import SectionHeader from "@/components/blog/SectionHeader";
import { useFadeInOnScroll } from "@/hooks/useFadeInOnScroll";
import type { WooProduct } from "@/lib/types";

const caveat = Caveat({ subsets: ["latin"], weight: ["400", "600"] });

const GRAIN_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`;

const POLAROID_ROTS = [-3, 2, -2, 3] as const;

const FADE_CLASS = "transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]";
const VISIBLE = "opacity-100 translate-y-0";
const HIDDEN = "opacity-0 translate-y-6";

type Props = {
  newestProducts: WooProduct[];
};

export default function AboutClient({ newestProducts }: Props) {
  const { language } = useLanguage();
  const t = useMemo(() => createT(language), [language]);

  /* Hero: simple mounted fade (always in initial viewport) */
  const [heroMounted, setHeroMounted] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setHeroMounted(true);
      return;
    }
    const id = setTimeout(() => setHeroMounted(true), 100);
    return () => clearTimeout(id);
  }, []);

  /* Scroll-triggered fade-in for every other section */
  const s1  = useFadeInOnScroll();
  const s2  = useFadeInOnScroll();
  const s3  = useFadeInOnScroll();
  const s35 = useFadeInOnScroll();
  const s4  = useFadeInOnScroll();
  const s5  = useFadeInOnScroll();
  const s6  = useFadeInOnScroll();
  const s7  = useFadeInOnScroll();

  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "success" | "error">("idle");

  const polaroids = [
    { src: "/about/flo_und_girl.jpg",   caption: t("ABOUT_S3_5_CAPTION_1") },
    { src: "/about/flow_und_crew.jpg",  caption: t("ABOUT_S3_5_CAPTION_2") },
    { src: "/about/phil_und_july.jpg",  caption: t("ABOUT_S3_5_CAPTION_3") },
    { src: "/about/phil_und_simon.jpg", caption: t("ABOUT_S3_5_CAPTION_4") },
  ];

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitState("idle");

    const formData = new FormData(e.currentTarget);
    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      filmTitle: formData.get("filmTitle"),
      message: formData.get("message"),
    };

    try {
      const res = await fetch("/api/about/filmmaker-submission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSubmitState("success");
        (e.target as HTMLFormElement).reset();
      } else {
        setSubmitState("error");
      }
    } catch {
      setSubmitState("error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-20 sm:py-28">
      <div className="space-y-20">

        {/* ── Section 0: Hero ──────────────────────────────────────────── */}
        <section
          className={`${FADE_CLASS} ${heroMounted ? VISIBLE : HIDDEN}`}
        >
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
        <section
          ref={s1.ref as React.RefObject<HTMLElement>}
          className={`${FADE_CLASS} ${s1.visible ? VISIBLE : HIDDEN}`}
        >
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
        <section
          ref={s2.ref as React.RefObject<HTMLElement>}
          className={`${FADE_CLASS} ${s2.visible ? VISIBLE : HIDDEN}`}
        >
          <SectionHeader
            eyebrow={t("ABOUT_S2_EYEBROW")}
            title={t("ABOUT_S2_TITLE")}
          />
          <div className="max-w-3xl space-y-6 text-base leading-relaxed text-white/80 sm:text-lg">
            <p>{t("ABOUT_S2_P1")}</p>
            <p>{t("ABOUT_S2_P2")}</p>
            <p>{t("ABOUT_S2_P3")}</p>
          </div>
        </section>

        {/* ── Section 3: Persönlich — photo + text ─────────────────────── */}
        <section
          ref={s3.ref as React.RefObject<HTMLElement>}
          className={`${FADE_CLASS} ${s3.visible ? VISIBLE : HIDDEN}`}
        >
          <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-16">
            {/* Photo */}
            <div className="relative">
              <div className="relative aspect-[4/5] overflow-hidden">
                <Image
                  src="/about/flo_und_phil.jpg"
                  alt="Florian und Philipp"
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  unoptimized
                />
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(ellipse 80% 70% at center, transparent 40%, rgba(10,10,10,0.4) 70%, rgba(10,10,10,0.95) 100%)",
                  }}
                />
                <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#0a0a0a] to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#0a0a0a] to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#0a0a0a] to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.08] mix-blend-overlay"
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

        {/* ── Section 3.5: Wir unterwegs — Polaroids ───────────────────── */}
        <section
          ref={s35.ref as React.RefObject<HTMLElement>}
          className={`${FADE_CLASS} ${s35.visible ? VISIBLE : HIDDEN}`}
        >
          <SectionHeader
            eyebrow={t("ABOUT_S3_5_EYEBROW")}
            title={t("ABOUT_S3_5_TITLE")}
          />
          <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-4 md:gap-6">
            {polaroids.map((p, i) => (
              <div
                key={p.src}
                className="transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                  transitionDelay: `${i * 100}ms`,
                  opacity: s35.visible ? 1 : 0,
                  transform: s35.visible
                    ? `translateY(0px) rotate(${POLAROID_ROTS[i]}deg)`
                    : `translateY(32px) rotate(${POLAROID_ROTS[i]}deg)`,
                }}
              >
                <div className="group relative bg-[#f5f0e8] p-3 pb-12 shadow-2xl transition-transform duration-300 hover:scale-[1.03]">
                  <div className="relative aspect-square overflow-hidden bg-black">
                    <Image
                      src={p.src}
                      alt={p.caption}
                      fill
                      className="object-cover"
                      style={{ filter: "grayscale(0.15) sepia(0.05)" }}
                      sizes="(max-width: 768px) 100vw, 25vw"
                      unoptimized
                    />
                  </div>
                  <p
                    className="absolute bottom-3 left-0 right-0 text-center text-base text-black/80"
                    style={{ fontFamily: caveat.style.fontFamily }}
                  >
                    {p.caption}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Section 4: Hinter der Kamera — text + CTA only ───────────── */}
        <section
          ref={s4.ref as React.RefObject<HTMLElement>}
          className={`${FADE_CLASS} ${s4.visible ? VISIBLE : HIDDEN}`}
        >
          <SectionHeader
            eyebrow={t("ABOUT_S4_EYEBROW")}
            title={t("ABOUT_S4_TITLE")}
          />
          <div className="max-w-3xl space-y-6 text-base leading-relaxed text-white/80 sm:text-lg">
            <p>{t("ABOUT_S4_P1")}</p>
            <p>{t("ABOUT_S4_P2")}</p>
          </div>
          <div className="mt-10 flex justify-start">
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

        {/* ── Section 5: Für Filmemacher — form ───────────────────────── */}
        <section
          ref={s5.ref as React.RefObject<HTMLElement>}
          className={`${FADE_CLASS} ${s5.visible ? VISIBLE : HIDDEN}`}
        >
          <SectionHeader
            eyebrow={t("ABOUT_S5_EYEBROW")}
            title={t("ABOUT_S5_TITLE")}
          />
          <div className="max-w-3xl text-base leading-relaxed text-white/80 sm:text-lg">
            <p>{t("ABOUT_S5_P1")}</p>
          </div>

          <div className="mt-8">
            <button
              onClick={() => {
                setFormOpen(!formOpen);
                setSubmitState("idle");
              }}
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
                <path
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  style={{
                    transform: formOpen ? "rotate(45deg)" : "rotate(0deg)",
                    transformOrigin: "center",
                    transition: "transform 300ms ease",
                  }}
                />
              </svg>
              <span>{formOpen ? t("ABOUT_FORM_CLOSE_LABEL") : t("ABOUT_FORM_OPEN_LABEL")}</span>
            </button>

            {formOpen && (
              <form
                onSubmit={handleSubmit}
                className="mt-8 max-w-2xl space-y-6 border border-white/10 bg-black/40 p-6 sm:p-8"
              >
                <div>
                  <label className="mb-2 block font-mono text-xs uppercase tracking-widest text-white/60">
                    {t("ABOUT_FORM_NAME")}
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    className="w-full border border-white/15 bg-black/40 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-[#c0392b]"
                  />
                </div>

                <div>
                  <label className="mb-2 block font-mono text-xs uppercase tracking-widest text-white/60">
                    {t("ABOUT_FORM_EMAIL")}
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    className="w-full border border-white/15 bg-black/40 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-[#c0392b]"
                  />
                </div>

                <div>
                  <label className="mb-2 block font-mono text-xs uppercase tracking-widest text-white/60">
                    {t("ABOUT_FORM_FILM_TITLE")}
                  </label>
                  <input
                    type="text"
                    name="filmTitle"
                    required
                    className="w-full border border-white/15 bg-black/40 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-[#c0392b]"
                  />
                </div>

                <div>
                  <label className="mb-2 block font-mono text-xs uppercase tracking-widest text-white/60">
                    {t("ABOUT_FORM_MESSAGE")}
                  </label>
                  <textarea
                    name="message"
                    required
                    rows={5}
                    className="w-full resize-none border border-white/15 bg-black/40 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-[#c0392b]"
                  />
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="border border-[#c0392b] bg-[#c0392b] px-8 py-3 text-sm font-bold uppercase tracking-widest text-white transition hover:bg-[#a93226] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? t("ABOUT_FORM_SUBMITTING") : t("ABOUT_FORM_SUBMIT")}
                  </button>

                  {submitState === "success" && (
                    <p className="text-sm text-green-400">{t("ABOUT_FORM_SUCCESS")}</p>
                  )}
                  {submitState === "error" && (
                    <p className="text-sm text-red-400">{t("ABOUT_FORM_ERROR")}</p>
                  )}
                </div>
              </form>
            )}
          </div>
        </section>

        {/* ── Section 6: Archiv-Block ───────────────────────────────────── */}
        {newestProducts.length > 0 && (
          <section
            ref={s6.ref as React.RefObject<HTMLElement>}
            className={`${FADE_CLASS} ${s6.visible ? VISIBLE : HIDDEN}`}
          >
            <SectionHeader
              eyebrow={t("ABOUT_S6_EYEBROW")}
              title={t("ABOUT_S6_TITLE")}
            />
            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
              {newestProducts.map((p, i) => (
                <Link
                  key={p.id}
                  href={`/shop/${p.slug}`}
                  className="group relative block overflow-hidden border border-white/10 bg-black/40 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#c0392b]/40"
                  style={{
                    transitionDelay: `${i * 100}ms`,
                    opacity: s6.visible ? 1 : 0,
                    transform: s6.visible ? "translateY(0px)" : "translateY(24px)",
                  }}
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
        <section
          ref={s7.ref as React.RefObject<HTMLElement>}
          className={`border-t border-white/10 pt-20 ${FADE_CLASS} ${s7.visible ? VISIBLE : HIDDEN}`}
        >
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
