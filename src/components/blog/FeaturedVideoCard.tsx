"use client";

import Image from "next/image";
import type { BlogVideoItem } from "@/lib/video-blog-types";

const GRAIN_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`;

function formatViews(count: number | null): string {
  if (!count) return "0";
  return new Intl.NumberFormat("de-DE").format(count);
}

function formatDuration(seconds: number | null): string {
  const s = seconds ?? 0;
  const m = Math.max(1, Math.round(s / 60));
  return `${m} Min`;
}

type Props = {
  video: BlogVideoItem;
  language: "de" | "en";
  eyebrowLabel: string;
  onPlay: () => void;
};

export default function FeaturedVideoCard({
  video,
  language,
  eyebrowLabel,
  onPlay,
}: Props) {
  const description =
    language === "en" && video.description_en?.trim()
      ? video.description_en
      : video.description?.trim() ?? "";

  return (
    <section className="mb-12">
      {/* Eyebrow above the card */}
      <div className="mb-4 flex items-center gap-3">
        <span className="h-px w-12 bg-[#c0392b]" aria-hidden="true" />
        <span className="font-mono text-xs uppercase tracking-[0.25em] text-[#c0392b]">
          {eyebrowLabel}
        </span>
      </div>

      {/* Card */}
      <button
        type="button"
        onClick={onPlay}
        className="group relative block w-full overflow-hidden border border-white/10 bg-black text-left transition hover:border-[#c0392b]/40 aspect-[16/9] sm:aspect-[21/9]"
      >
        {/* Thumbnail */}
        {video.thumbnail_url ? (
          <Image
            src={video.thumbnail_url}
            alt={video.title}
            fill
            className="object-cover transition duration-700 group-hover:scale-105"
            sizes="100vw"
            priority
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 bg-white/5" />
        )}

        {/* Bottom-up gradient */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black via-black/70 to-transparent" />

        {/* Radial vignette bottom-left for text area */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 25% 80%, rgba(0,0,0,0.7), transparent 60%)",
          }}
        />

        {/* Grain overlay — cinematic consistency with hero */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay"
          style={{
            backgroundImage: GRAIN_SVG,
            backgroundRepeat: "repeat",
            backgroundSize: "200px 200px",
          }}
        />

        {/* Play button — centered */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex h-20 w-20 items-center justify-center bg-[#c0392b] transition duration-200 ease-out group-hover:scale-110 group-hover:bg-[#a93226] sm:h-24 sm:w-24">
            {/* Play triangle — 2px right offset for optical centering */}
            <svg
              viewBox="0 0 24 24"
              fill="white"
              className="h-8 w-8 sm:h-10 sm:w-10"
              style={{ marginLeft: "2px" }}
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        {/* Text overlay — bottom-left */}
        <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 md:p-10">
          <h2 className="mb-2 max-w-3xl text-2xl font-bold uppercase leading-tight tracking-tight text-white sm:text-3xl md:text-4xl lg:text-5xl">
            {video.title}
          </h2>

          {description && (
            <p className="mb-4 line-clamp-2 max-w-2xl text-sm text-white/70 sm:text-base">
              {description}
            </p>
          )}

          <div className="flex items-center gap-4 font-mono text-xs uppercase tracking-widest text-white/60">
            <span>{formatViews(video.view_count)} Views</span>
            <span className="text-[#c0392b]" aria-hidden="true">·</span>
            <span>{formatDuration(video.duration_seconds)}</span>
          </div>
        </div>
      </button>
    </section>
  );
}
