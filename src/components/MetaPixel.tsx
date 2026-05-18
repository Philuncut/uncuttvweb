"use client";

import Script from "next/script";
import { useEffect } from "react";

export default function MetaPixel() {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkAndTrack = () => {
      const fbq = (window as any).fbq;
      if (!fbq) {
        setTimeout(checkAndTrack, 50);
        return;
      }

      try {
        const stored = localStorage.getItem("cookie_consent");
        if (stored === "all") {
          fbq("consent", "grant");
          fbq("track", "PageView");
        }
      } catch (e) {
        console.error("[MetaPixel] consent check failed:", e);
      }
    };

    checkAndTrack();

    const handleGrant = () => {
      const fbq = (window as any).fbq;
      if (fbq) {
        fbq("consent", "grant");
        fbq("track", "PageView");
      }
    };

    const handleRevoke = () => {
      const fbq = (window as any).fbq;
      if (fbq) {
        fbq("consent", "revoke");
      }
    };

    window.addEventListener("meta-pixel-grant", handleGrant);
    window.addEventListener("meta-pixel-revoke", handleRevoke);

    return () => {
      window.removeEventListener("meta-pixel-grant", handleGrant);
      window.removeEventListener("meta-pixel-revoke", handleRevoke);
    };
  }, []);

  if (!pixelId) {
    console.warn("[MetaPixel] NEXT_PUBLIC_META_PIXEL_ID not set");
    return null;
  }

  return (
    <>
      <Script id="meta-pixel-init" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');

          fbq('consent', 'revoke');
          fbq('init', '${pixelId}');
        `}
      </Script>
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}
