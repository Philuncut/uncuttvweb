"use client";

import { useState, useEffect } from "react";

const slideKeyframes = `
@keyframes loader-slide-inline {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200px); }
}
@keyframes logo-glitch-inline {
  0%, 90%, 100% { filter: blur(0px); opacity: 1; }
  92% { filter: blur(4px); opacity: 0.7; }
  94% { filter: blur(0px); opacity: 1; }
  96% { filter: blur(2px); opacity: 0.8; }
  98% { filter: blur(0px); opacity: 1; }
}
`;

export default function CinematicLoader({ show }: { show: boolean }) {
  const [mounted, setMounted] = useState(show);
  const [visible, setVisible] = useState(show);

  useEffect(() => {
    if (show) {
      setMounted(true);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(t);
    }
  }, [show]);

  if (!mounted) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: slideKeyframes }} />
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}
      >
        <h1
          style={{
            fontSize: "4rem",
            fontWeight: 900,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            animation: "logo-glitch-inline 2.5s infinite",
          }}
        >
          <span style={{ color: "#fff" }}>UNCUT</span>
          <span style={{ color: "#c0392b" }}>TV</span>
        </h1>
        <div
          style={{
            marginTop: 24,
            height: 2,
            width: 200,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "40%",
              height: "100%",
              background: "#c0392b",
              boxShadow: "0 0 15px rgba(192,57,43,0.9)",
              animation: "loader-slide-inline 1.2s ease-in-out infinite",
            }}
          />
        </div>
      </div>
    </>
  );
}
