"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { formatPrice } from "@/lib/format-price";
import { parsePrice } from "@/lib/parse-price";
import type { BlogProductCard, BlogVideoItem } from "@/lib/video-blog-types";

const FONT_HEADING = `'Playfair Display', Georgia, serif`;
const FONT_BODY = `'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
const DESC_THRESHOLD = 200;

function productLink(slug: string, videoId: string): string {
  return `/shop/${slug}?source=video&video_id=${encodeURIComponent(videoId)}`;
}

type Props = {
  video: BlogVideoItem;
  embedReady: boolean;
  embedSrc: string;
  products: BlogProductCard[];
  onClose: () => void;
  inVideoLabel: string;
  buyNowLabel: string;
  showMoreLabel: string;
  showLessLabel: string;
};

export default function VideoLightbox({
  video,
  embedReady,
  embedSrc,
  products,
  onClose,
  inVideoLabel,
  buyNowLabel,
  showMoreLabel,
  showLessLabel,
}: Props) {
  const [descExpanded, setDescExpanded] = useState(false);

  const rawDesc = video.description?.trim() ?? "";
  const needsToggle = rawDesc.length > DESC_THRESHOLD;
  const displayedDesc =
    needsToggle && !descExpanded
      ? `${rawDesc.slice(0, DESC_THRESHOLD).trimEnd()}…`
      : rawDesc;

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/90" onClick={onClose} aria-hidden />
      <div
        className="fixed inset-0 z-[201] flex items-stretch justify-center overflow-y-auto overscroll-contain sm:items-center sm:p-4"
        style={{
          paddingTop: "max(0px, env(safe-area-inset-top))",
          paddingBottom: "max(0px, env(safe-area-inset-bottom))",
        }}
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={video.title}
          className="relative my-0 flex h-full min-h-0 w-full max-w-[1200px] flex-col overflow-hidden bg-[#111] text-white sm:my-auto sm:h-auto sm:max-h-[90vh] sm:rounded-lg sm:shadow-2xl"
          style={{ fontFamily: FONT_BODY }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 z-20 flex shrink-0 justify-end border-b border-white/10 bg-[#111]/95 px-3 py-2 backdrop-blur-sm">
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center text-2xl leading-none text-white/80 transition hover:text-white"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4 sm:px-6">
            <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-md bg-black">
              {embedReady && (
                <iframe
                  src={embedSrc}
                  title={video.title}
                  className="h-full w-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              )}
            </div>
            <h2
              className="mt-4 text-xl font-bold leading-snug text-white sm:mt-6 sm:text-2xl"
              style={{ fontFamily: FONT_HEADING }}
            >
              {video.title}
            </h2>
            {rawDesc && (
              <div className="mt-2" style={{ fontFamily: FONT_BODY }}>
                <p
                  className="text-sm leading-relaxed text-white/70 sm:text-base"
                  style={{
                    overflow: "hidden",
                    transition: "max-height 300ms ease",
                    maxHeight: descExpanded ? "1000px" : "4.5em",
                  }}
                >
                  {displayedDesc}
                </p>
                {needsToggle && (
                  <button
                    type="button"
                    onClick={() => setDescExpanded((v) => !v)}
                    className="mt-1 text-sm underline underline-offset-2 text-white/50 hover:text-[#c0392b] transition-colors"
                    style={{ fontFamily: FONT_BODY }}
                  >
                    {descExpanded ? showLessLabel : showMoreLabel}
                  </button>
                )}
              </div>
            )}
            {products.length > 0 && (
              <div className="mt-8">
                <h3
                  className="mb-4 text-xs font-bold tracking-widest text-white/50"
                  style={{ fontFamily: FONT_BODY }}
                >
                  {inVideoLabel.toUpperCase()}
                </h3>
                <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:snap-none">
                  {products.map((product) => (
                    <div
                      key={product.id}
                      className="w-[min(85vw,220px)] shrink-0 snap-start rounded border border-white/10 bg-black/30 p-3 md:w-auto md:min-w-0"
                    >
                      {product.image && (
                        <div className="relative mb-3 aspect-square w-full overflow-hidden rounded bg-black/50">
                          <Image
                            src={product.image}
                            alt={product.name}
                            fill
                            className="object-cover"
                            sizes="220px"
                            unoptimized
                          />
                        </div>
                      )}
                      <p
                        className="line-clamp-2 text-sm font-medium text-white"
                        style={{ fontFamily: FONT_BODY }}
                      >
                        {product.name}
                      </p>
                      <p
                        className="mt-1 text-sm text-[#c0392b]"
                        style={{ fontFamily: FONT_BODY }}
                      >
                        {formatPrice(parsePrice(product.price))}
                      </p>
                      <Link
                        href={productLink(product.slug, video.video_id)}
                        className="mt-3 inline-block w-full rounded bg-[#c0392b] py-2 text-center text-xs font-bold tracking-wider text-white hover:bg-[#a93226]"
                        style={{ fontFamily: FONT_BODY }}
                      >
                        {buyNowLabel}
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
