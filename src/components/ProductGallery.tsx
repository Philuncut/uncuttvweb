"use client";

import { useState } from "react";
import type { WooImage } from "@/lib/types";

export default function ProductGallery({ images }: { images: WooImage[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const mainImage = images[activeIndex] ?? images[0];

  if (images.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center bg-[#111] text-white/20">
        NO IMAGE
      </div>
    );
  }

  return (
    <div>
      {/* Main image */}
      <div className="group overflow-hidden bg-[#111]">
        <img
          src={mainImage.src}
          alt={mainImage.alt || mainImage.name}
          className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-none">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActiveIndex(i)}
              className="shrink-0 cursor-pointer overflow-hidden"
              style={{
                width: 72,
                height: 72,
                border:
                  i === activeIndex
                    ? "2px solid #c0392b"
                    : "2px solid transparent",
                opacity: i === activeIndex ? 1 : 0.5,
                transition: "all 0.2s ease",
              }}
            >
              <img
                src={img.src}
                alt={img.alt || img.name}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
