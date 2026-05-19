"use client";

import { Suspense, useState, useEffect } from "react";
import type { WooProduct, WooCategory } from "@/lib/types";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Newsletter from "@/components/Newsletter";
import ShopContent from "@/components/ShopContent";
import ShopHero from "@/components/ShopHero";

interface ShopPageProps {
  products: WooProduct[];
  categories: WooCategory[];
}

const AGE_KEY = "agegate_confirmed";

export default function ShopPage({ products, categories }: ShopPageProps) {
  const [ageConfirmed, setAgeConfirmed] = useState(true); // default true to avoid flash

  useEffect(() => {
    const stored = localStorage.getItem(AGE_KEY);
    if (stored !== "1") {
      setAgeConfirmed(false);
    }
  }, []);

  function handleConfirm() {
    localStorage.setItem(AGE_KEY, "1");
    setAgeConfirmed(true);
  }

  return (
    <>
      {/* Age Gate Overlay */}
      {!ageConfirmed && (
        <div
          id="age-gate-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0,0,0,0.92)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            zIndex: 200000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              maxWidth: 420,
              width: "90%",
              border: "1px solid rgba(255,255,255,0.1)",
              backgroundColor: "#111",
              padding: "32px",
            }}
          >
            <h2
              style={{
                color: "white",
                fontSize: "1.5rem",
                fontWeight: 900,
                textAlign: "center",
                letterSpacing: "0.05em",
              }}
            >
              Bist du 18 Jahre oder älter?
            </h2>
            <p
              style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: "14px",
                textAlign: "center",
                marginTop: 12,
              }}
            >
              Der Shop enthält Inhalte, die nur für Erwachsene bestimmt sind.
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                marginTop: 24,
              }}
            >
              <button
                type="button"
                onClick={handleConfirm}
                style={{
                  backgroundColor: "#c0392b",
                  color: "white",
                  border: "none",
                  padding: "14px 24px",
                  fontSize: "14px",
                  fontWeight: "bold",
                  letterSpacing: "0.1em",
                  cursor: "pointer",
                  touchAction: "manipulation",
                }}
              >
                JA, WEITER ZUM SHOP
              </button>
              <a
                href="https://www.google.com"
                style={{
                  border: "1px solid rgba(255,255,255,0.2)",
                  backgroundColor: "transparent",
                  color: "rgba(255,255,255,0.7)",
                  padding: "14px 24px",
                  fontSize: "14px",
                  fontWeight: "bold",
                  letterSpacing: "0.1em",
                  textAlign: "center",
                  textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                NEIN, ZURÜCK
              </a>
            </div>
          </div>
        </div>
      )}

      <Navbar />
      <ShopHero />
      <Suspense fallback={null}>
        <ShopContent products={products} categories={categories} />
      </Suspense>
      <Newsletter />
      <Footer />
    </>
  );
}
