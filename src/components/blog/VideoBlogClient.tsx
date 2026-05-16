"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useLanguage } from "@/lib/LanguageContext";
import { createT, formatTranslation } from "@/lib/translations";
import type { BlogVideoItem, VideoPlatform } from "@/lib/video-blog-types";
import VideoLightbox from "@/components/blog/VideoLightbox";

const FONT_HEADING = `'Playfair Display', Georgia, serif`;
const FONT_BODY = `'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;

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

  const subscribeCta = formatTranslation("BLOG_SUBSCRIBE_CTA", language, {
    count: subscriberCount,
  });

  const embedSrc = activeVideo
    ? tab === "youtube"
      ? `https://www.youtube.com/embed/${activeVideo.video_id}?modestbranding=1&rel=0`
      : `https://player.vimeo.com/video/${activeVideo.video_id}`
    : "";

  const lightboxProducts =
    activeVideo && activeVideo.products.length > 0 ? activeVideo.products : [];

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;700&display=swap"
        rel="stylesheet"
      />

      <section
        className="flex flex-col items-center justify-center bg-[#0a0a0a] px-4 text-center"
        style={{ minHeight: "30vh", fontFamily: FONT_BODY }}
      >
        <h1
          className="text-3xl font-bold text-white sm:text-4xl md:text-5xl"
          style={{ fontFamily: FONT_HEADING }}
        >
          {t("BLOG_HERO_TITLE")}
        </h1>
        <p className="mt-3 max-w-xl text-sm text-white/70 sm:text-base">
          {t("BLOG_HERO_SUBTITLE")}
        </p>
      </section>

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

      <section className="border-t border-white/10 bg-[#0a0a0a] px-4 py-16 text-center">
        <p className="mb-6 text-lg text-white/90" style={{ fontFamily: FONT_BODY }}>
          {subscribeCta}
        </p>
        <a
          href={subscribeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded bg-[#c0392b] px-8 py-3 text-sm font-bold tracking-widest text-white transition hover:bg-[#a93226]"
        >
          {t("BLOG_SUBSCRIBE_BUTTON")}
        </a>
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
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {videos.map((video) => (
        <button
          key={video.video_id}
          type="button"
          className="group w-full text-left"
          onClick={() => onOpen(video)}
        >
          <VideoCard video={video} language={language} />
        </button>
      ))}
    </div>
  );
}

function VideoCard({
  video,
  language,
}: {
  video: BlogVideoItem;
  language: "de" | "en";
}) {
  const views = formatTranslation("BLOG_VIDEO_VIEWS", language, {
    count: new Intl.NumberFormat(language === "de" ? "de-DE" : "en-US").format(
      video.view_count ?? 0
    ),
  });
  const minutes = formatTranslation("BLOG_VIDEO_MINUTES", language, {
    minutes: String(Math.max(1, Math.round((video.duration_seconds ?? 0) / 60))),
  });

  return (
    <article>
      {/* -webkit-touch-callout suppresses iOS Safari's native media overlay on thumbnail images */}
      <div
        className="relative aspect-video overflow-hidden rounded bg-black/40"
        style={{ WebkitTouchCallout: "none" as never, userSelect: "none" }}
      >
        {video.thumbnail_url ? (
          <Image
            src={video.thumbnail_url}
            alt={video.title}
            fill
            className="object-cover transition duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 bg-white/5" />
        )}
        {/* UncutTV branded play button — overlays iOS default media controls */}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition duration-200 ease-out group-hover:scale-110 sm:h-12 sm:w-12"
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
              className="h-6 w-6 sm:h-5 sm:w-5"
              style={{ marginLeft: "2px" }}
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
      </div>
      <h3 className="mt-3 line-clamp-2 text-sm font-semibold text-white">
        {video.title}
      </h3>
      <p className="mt-1 text-xs text-white/40">
        {views} · {minutes}
      </p>
    </article>
  );
}
