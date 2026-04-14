"use client";

import { useState, useEffect, useCallback } from "react";

const CONSENT_KEY = "cookie_consent";
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

function loadMetaPixel() {
  if (!PIXEL_ID || PIXEL_ID === "your_meta_pixel_id") return;
  if (document.getElementById("meta-pixel-script")) return;

  const script = document.createElement("script");
  script.id = "meta-pixel-script";
  script.innerHTML = `
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${PIXEL_ID}');
    fbq('track', 'PageView');
  `;
  document.head.appendChild(script);

  const noscript = document.createElement("noscript");
  noscript.innerHTML = `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1" />`;
  document.body.appendChild(noscript);
}

export function openCookieSettings() {
  localStorage.removeItem(CONSENT_KEY);
  window.dispatchEvent(new Event("reopenCookieConsent"));
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (stored === "all") {
      loadMetaPixel();
    } else if (!stored) {
      setVisible(true);
    }

    function onReopen() {
      setVisible(true);
    }
    window.addEventListener("reopenCookieConsent", onReopen);
    return () => window.removeEventListener("reopenCookieConsent", onReopen);
  }, []);

  const handleAcceptAll = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, "all");
    setVisible(false);
    loadMetaPixel();
  }, []);

  const handleNecessaryOnly = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, "necessary");
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 199999,
        backgroundColor: "#111",
        borderTop: "1px solid #222",
        padding: "16px 20px",
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 1.5, margin: 0 }}>
          Wir verwenden Cookies für wesentliche Website-Funktionen (Warenkorb, Altersverifikation).
          Mit &quot;Alle akzeptieren&quot; erlaubst du auch Analyse- und Marketing-Cookies.{" "}
          <a
            href="/datenschutz"
            style={{ color: "#c0392b", textDecoration: "underline" }}
          >
            Datenschutzerklärung
          </a>
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleAcceptAll}
            style={{
              backgroundColor: "#c0392b",
              color: "white",
              border: "none",
              padding: "10px 24px",
              fontSize: 13,
              fontWeight: "bold",
              letterSpacing: "0.1em",
              cursor: "pointer",
              touchAction: "manipulation",
              flex: "1 1 auto",
              minWidth: 160,
            }}
          >
            ALLE AKZEPTIEREN
          </button>
          <button
            type="button"
            onClick={handleNecessaryOnly}
            style={{
              backgroundColor: "transparent",
              color: "rgba(255,255,255,0.6)",
              border: "1px solid #333",
              padding: "10px 24px",
              fontSize: 13,
              fontWeight: "bold",
              letterSpacing: "0.1em",
              cursor: "pointer",
              touchAction: "manipulation",
              flex: "1 1 auto",
              minWidth: 160,
            }}
          >
            NUR NOTWENDIGE
          </button>
        </div>
      </div>
    </div>
  );
}
