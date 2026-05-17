"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useLanguage } from "@/lib/LanguageContext";
import { createT, formatTranslation } from "@/lib/translations";
import type { BlogVideoItem, VideoPlatform } from "@/lib/video-blog-types";
import VideoLightbox from "@/components/blog/VideoLightbox";
import BlogSubscribeHero from "@/components/blog/BlogSubscribeHero";
import FeaturedVideoCard from "@/components/blog/FeaturedVideoCard";
import SectionHeader from "@/components/blog/SectionHeader";

type Props = {
  youtubeVideos: BlogVideoItem[];
  vimeoVideos: BlogVideoItem[];
  vimeoConfigured: boolean;
  subscriberCount: string;
  subscribeUrl: string;
};

function tabButtonClass(active: boolean): string {
  return `px-6 py-4 text-base font-bold uppercase tracking-widest transition ${
    active
      ? "-mb-[2px] border-b-2 border-[#c0392b] text-white"
      : "border-b-2 border-transparent text-white/40 hover:text-white/70"
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

  const featured = videos.length > 0 ? videos[0] : null;

  const mostViewed = [...videos]
    .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0))
    .filter((v) => v.video_id !== featured?.video_id)
    .slice(0, 4);

  const mostViewedIds = new Set(mostViewed.map((v) => v.video_id));

  const newest = videos
    .filter(
      (v) =>
        v.video_id !== featured?.video_id && !mostViewedIds.has(v.video_id)
    )
    .slice(0, 4);

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
          <div className="space-y-16">
            {/* Section 1: Featured — newest video */}
            {featured && (
              <FeaturedVideoCard
                video={featured}
                language={language}
                eyebrowLabel={t("BLOG_FEATURED_EYEBROW")}
                onPlay={() => setActiveVideo(featured)}
              />
            )}

            {/* Section 2: Most viewed */}
            {mostViewed.length > 0 && (
              <section>
                <SectionHeader eyebrow={t("BLOG_SECTION_MOST_VIEWED")} />
                <VideoGrid
                  videos={mostViewed}
                  language={language}
                  onOpen={setActiveVideo}
                />
              </section>
            )}

            {/* Section 3: Newest (excluding featured + mostViewed) */}
            {newest.length > 0 && (
              <section>
                <SectionHeader eyebrow={t("BLOG_SECTION_NEWEST")} />
                <VideoGrid
                  videos={newest}
                  language={language}
                  onOpen={setActiveVideo}
                />
              </section>
            )}
          </div>
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
    <div className="border-b-2 border-white/10 bg-[#0a0a0a]">
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
  if (videos.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {videos.map((video, i) => (
        <VideoCard
          key={video.video_id}
          video={video}
          language={language}
          animationDelay={Math.min(i * 60, 600)}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function VideoCard({
  video,
  language,
  animationDelay,
  onOpen,
}: {
  video: BlogVideoItem;
  language: "de" | "en";
  animationDelay: number;
  onOpen: (v: BlogVideoItem) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect prefers-reduced-motion — skip animation entirely
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
      { threshold: 0.1, rootMargin: "50px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const views = formatTranslation("BLOG_VIDEO_VIEWS", language, {
    count: new Intl.NumberFormat(language === "de" ? "de-DE" : "en-US").format(
      video.view_count ?? 0
    ),
  });
  const minutes = formatTranslation("BLOG_VIDEO_MINUTES", language, {
    minutes: String(Math.max(1, Math.round((video.duration_seconds ?? 0) / 60))),
  });

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onOpen(video)}
      className="group w-full text-left"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 500ms cubic-bezier(0.22, 1, 0.36, 1), transform 500ms cubic-bezier(0.22, 1, 0.36, 1)`,
        transitionDelay: visible ? `${animationDelay}ms` : "0ms",
      }}
    >
      <article className="relative flex flex-col overflow-hidden border border-white/5 bg-black/40 transition hover:border-[#c0392b]/40">
        {/* Thumbnail — 16:9 */}
        {/* -webkit-touch-callout suppresses iOS Safari's native media overlay */}
        <div
          className="relative aspect-video overflow-hidden"
          style={{ WebkitTouchCallout: "none" as never, userSelect: "none" }}
        >
          {video.thumbnail_url ? (
            <Image
              src={video.thumbnail_url}
              alt={video.title}
              fill
              className="object-cover transition duration-500 group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 bg-white/5" />
          )}

          {/* Hover red tint */}
          <div className="pointer-events-none absolute inset-0 bg-[#c0392b]/0 transition group-hover:bg-[#c0392b]/5" />

          {/* Play button */}
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span
              className="flex h-12 w-12 items-center justify-center transition duration-200 ease-out group-hover:scale-110"
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
                className="h-5 w-5"
                style={{ marginLeft: "2px" }}
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
        </div>

        {/* Text section */}
        <div className="p-3">
          <h3 className="line-clamp-2 text-sm font-medium text-white">{video.title}</h3>
          <p className="mt-1 text-[11px] text-white/50">
            {views} · {minutes}
          </p>
        </div>
      </article>
    </button>
  );
}
