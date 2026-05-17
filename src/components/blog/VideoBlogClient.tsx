"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useLanguage } from "@/lib/LanguageContext";
import { createT, formatTranslation } from "@/lib/translations";
import type { BlogVideoItem, VideoPlatform } from "@/lib/video-blog-types";
import VideoLightbox from "@/components/blog/VideoLightbox";
import BlogSubscribeHero from "@/components/blog/BlogSubscribeHero";

type Props = {
  youtubeVideos: BlogVideoItem[];
  vimeoVideos: BlogVideoItem[];
  vimeoConfigured: boolean;
  subscriberCount: string;
  subscribeUrl: string;
};

function tabButtonClass(active: boolean): string {
  return `px-6 py-4 text-sm font-bold tracking-widest transition ${
    active
      ? "border-b-2 border-[#c0392b] text-white"
      : "border-b-2 border-transparent text-white/50 hover:text-white/80"
  }`;
}

export default function VideoBlogClient({
  youtubeVideos,
  vimeoVideos,
  vimeoConfigured,
  subscriberCount,
  subscribeUrl,
}: Props) {
  const { language } = useLanguage();
  const t = useMemo(() => createT(language), [language]);
  const [tab, setTab] = useState<VideoPlatform>("youtube");
  const [activeVideo, setActiveVideo] = useState<BlogVideoItem | null>(null);
  const [embedReady, setEmbedReady] = useState(false);

  const videos = tab === "youtube" ? youtubeVideos : vimeoVideos;
  const dbEmpty = youtubeVideos.length === 0 && vimeoVideos.length === 0;
  const showVimeoPlaceholder = tab === "vimeo" && !vimeoConfigured;
  const showEmpty =
    !showVimeoPlaceholder &&
    ((tab === "youtube" && youtubeVideos.length === 0) ||
      (tab === "vimeo" && vimeoVideos.length === 0));

  const closeLightbox = useCallback(() => {
    setActiveVideo(null);
    setEmbedReady(false);
  }, []);

  useEffect(() => {
    if (!activeVideo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [activeVideo, closeLightbox]);

  useEffect(() => {
    if (!activeVideo) return;
    setEmbedReady(false);
    const id = requestAnimationFrame(() => setEmbedReady(true));
    return () => cancelAnimationFrame(id);
  }, [activeVideo]);

  const embedSrc = activeVideo
    ? tab === "youtube"
      ? `https://www.youtube.com/embed/${activeVideo.video_id}?modestbranding=1&rel=0`
      : `https://player.vimeo.com/video/${activeVideo.video_id}`
    : "";

  const lightboxProducts =
    activeVideo && activeVideo.products.length > 0 ? activeVideo.products : [];

  return (
    <>
      <BlogSubscribeHero
        subscriberCount={subscriberCount}
        subscribeUrl={subscribeUrl}
        language={language}
        t={t}
      />

      <BlogTabs tab={tab} setTab={setTab} t={t} />

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        {dbEmpty && (
          <p className="py-16 text-center text-white/50">{t("BLOG_EMPTY_STATE")}</p>
        )}
        {showVimeoPlaceholder && (
          <p className="py-16 text-center text-white/50">
            {t("BLOG_VIMEO_PLACEHOLDER")}
          </p>
        )}
        {showEmpty && !dbEmpty && (
          <p className="py-16 text-center text-white/50">{t("BLOG_EMPTY_STATE")}</p>
        )}
        {!showVimeoPlaceholder && !showEmpty && (
          <VideoGrid
            videos={videos}
            language={language}
            onOpen={setActiveVideo}
          />
        )}
      </section>

      {activeVideo && (
        <VideoLightbox
          video={activeVideo}
          embedReady={embedReady}
          embedSrc={embedSrc}
          products={lightboxProducts}
          onClose={closeLightbox}
          inVideoLabel={t("BLOG_IN_VIDEO_SHOWN")}
          buyNowLabel={t("BLOG_BUY_NOW")}
          showMoreLabel={t("BLOG_SHOW_MORE")}
          showLessLabel={t("BLOG_SHOW_LESS")}
          closeLabel={t("BLOG_CLOSE")}
          featuredProductsLabel={t("BLOG_FEATURED_PRODUCTS")}
        />
      )}
    </>
  );
}

function BlogTabs({
  tab,
  setTab,
  t,
}: {
  tab: VideoPlatform;
  setTab: (t: VideoPlatform) => void;
  t: (k: string) => string;
}) {
  return (
    <div className="border-b border-white/10 bg-[#0a0a0a]">
      <div className="mx-auto flex max-w-7xl justify-center gap-2">
        <button
          type="button"
          className={tabButtonClass(tab === "youtube")}
          onClick={() => setTab("youtube")}
        >
          {t("BLOG_TAB_YOUTUBE")}
        </button>
        <button
          type="button"
          className={tabButtonClass(tab === "vimeo")}
          onClick={() => setTab("vimeo")}
        >
          {t("BLOG_TAB_VIMEO")}
        </button>
      </div>
    </div>
  );
}

type CardSize = "large" | "wide" | "std";

function getCardSize(index: number): CardSize {
  const mod = index % 6;
  if (mod === 0) return "large";
  if (mod === 1 || mod === 4) return "wide";
  return "std";
}

function spanClass(size: CardSize): string {
  if (size === "large") return "md:col-span-2 md:row-span-2";
  if (size === "wide") return "md:col-span-2 md:row-span-1";
  return "md:col-span-1 md:row-span-1";
}

function VideoGrid({
  videos,
  language,
  onOpen,
}: {
  videos: BlogVideoItem[];
  language: "de" | "en";
  onOpen: (v: BlogVideoItem) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 md:auto-rows-[180px] lg:auto-rows-[220px]">
      {videos.map((video, i) => {
        const size = getCardSize(i);
        return (
          <button
            key={video.video_id}
            type="button"
            className={`group h-full w-full text-left ${spanClass(size)}`}
            onClick={() => onOpen(video)}
          >
            <VideoCard video={video} language={language} size={size} />
          </button>
        );
      })}
    </div>
  );
}

function VideoCard({
  video,
  language,
  size,
}: {
  video: BlogVideoItem;
  language: "de" | "en";
  size: CardSize;
}) {
  const views = formatTranslation("BLOG_VIDEO_VIEWS", language, {
    count: new Intl.NumberFormat(language === "de" ? "de-DE" : "en-US").format(
      video.view_count ?? 0
    ),
  });
  const minutes = formatTranslation("BLOG_VIDEO_MINUTES", language, {
    minutes: String(Math.max(1, Math.round((video.duration_seconds ?? 0) / 60))),
  });

  const isLarge = size === "large";
  const isWide = size === "wide";

  const titleClass = isLarge
    ? "line-clamp-2 text-lg font-bold text-white md:text-xl"
    : isWide
      ? "line-clamp-2 text-base font-semibold text-white md:text-lg"
      : "line-clamp-2 text-sm font-medium text-white";

  const metaClass =
    isLarge || isWide
      ? "mt-1 text-xs uppercase tracking-wider text-white/60"
      : "mt-1 text-[11px] text-white/50";

  const textPad = isLarge || isWide ? "p-5" : "p-3";

  const playSize = isLarge
    ? "h-20 w-20"
    : isWide
      ? "h-16 w-16"
      : "h-12 w-12";

  const iconSize = isLarge
    ? "h-8 w-8"
    : isWide
      ? "h-6 w-6"
      : "h-5 w-5";

  const imgSizes = isLarge || isWide
    ? "(max-width: 640px) 100vw, (max-width: 768px) 50vw, 50vw"
    : "(max-width: 640px) 100vw, (max-width: 768px) 50vw, 25vw";

  return (
    <article className="relative flex h-full flex-col overflow-hidden border border-white/5 bg-black/40 transition hover:border-[#c0392b]/40">
      {/* Thumbnail area — fills all available height */}
      {/* -webkit-touch-callout suppresses iOS Safari's native media overlay */}
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{ WebkitTouchCallout: "none" as never, userSelect: "none" }}
      >
        {video.thumbnail_url ? (
          <Image
            src={video.thumbnail_url}
            alt={video.title}
            fill
            className="object-cover transition duration-500 group-hover:scale-105"
            sizes={imgSizes}
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 bg-white/5" />
        )}

        {/* Bottom vignette for text legibility on large/wide cards */}
        {(isLarge || isWide) && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />
        )}

        {/* Hover red tint overlay */}
        <div className="pointer-events-none absolute inset-0 bg-[#c0392b]/0 transition group-hover:bg-[#c0392b]/5" />

        {/* Play button — UncutTV branded, overlays iOS media controls */}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span
            className={`flex ${playSize} items-center justify-center transition duration-200 ease-out group-hover:scale-110`}
            style={{
              background: "rgba(192, 57, 43, 0.95)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              backdropFilter: "blur(2px)",
              WebkitBackdropFilter: "blur(2px)",
            }}
          >
            {/* Play triangle — 2px right offset for optical centering */}
            <svg
              viewBox="0 0 24 24"
              fill="white"
              className={iconSize}
              style={{ marginLeft: "2px" }}
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
      </div>

      {/* Text section */}
      <div className={`shrink-0 ${textPad}`}>
        <h3 className={titleClass}>{video.title}</h3>
        <p className={metaClass}>
          {views} · {minutes}
        </p>
      </div>
    </article>
  );
}

