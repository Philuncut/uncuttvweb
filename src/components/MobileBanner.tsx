"use client";

import { useState } from "react";
import Link from "next/link";
import promoData from "../../data/promo-banner.json";

interface PromoItem {
  image: string;
  label: string;
}

interface PromoConfig {
  active: boolean;
  title: string;
  subtitle: string;
  label: string;
  ctaText: string;
  link: string;
  items?: PromoItem[];
}

const promo = promoData as PromoConfig;

export default function MobileBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (!promo.active || dismissed) return null;

  return (
    <div
      className="md:hidden"
      style={{
        backgroundColor: "#111",
        borderTop: "3px solid #c0392b",
        padding: "12px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "4px",
        }}
      >
        <span
          style={{
            color: "#c0392b",
            fontSize: "10px",
            fontWeight: "bold",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {promo.label}
        </span>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          style={{
            color: "#666",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "20px",
            lineHeight: 1,
            padding: "0 4px",
          }}
          aria-label="Schließen"
        >
          ×
        </button>
      </div>

      <div style={{ color: "white", fontWeight: "bold", fontSize: "15px" }}>
        {promo.title}
      </div>
      <div style={{ color: "#888", fontSize: "12px", marginBottom: "8px" }}>
        {promo.subtitle}
      </div>

      {promo.items && promo.items.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "12px",
            marginBottom: "10px",
            justifyContent: "center",
          }}
        >
          {promo.items.map((item, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <Link
                href={promo.link}
                className="block cursor-pointer transition-opacity hover:opacity-90"
              >
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.label}
                    style={{
                      width: "40px",
                      height: "56px",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "40px",
                      height: "56px",
                      backgroundColor: "#1a1a1a",
                    }}
                  />
                )}
              </Link>
              <div
                style={{ color: "#888", fontSize: "10px", marginTop: "4px" }}
              >
                {item.label}
              </div>
            </div>
          ))}
        </div>
      )}

      <Link
        href={promo.link}
        style={{
          display: "block",
          backgroundColor: "#c0392b",
          color: "white",
          padding: "10px",
          textAlign: "center",
          fontWeight: "bold",
          fontSize: "12px",
          letterSpacing: "0.1em",
          textDecoration: "none",
        }}
      >
        {promo.ctaText} →
      </Link>
    </div>
  );
}
