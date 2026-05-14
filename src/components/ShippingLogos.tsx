import type { ReactNode } from "react";

const svgFrame =
  "shrink-0 overflow-hidden rounded-md border border-black/15";

/** ~56×36 — Marineblau, weißes „GLS“, gelber Punkt (#FFD200) als Markenakzent. */
export function GlsLogo({ className }: { className?: string }) {
  return (
    <svg
      width={56}
      height={36}
      viewBox="0 0 56 36"
      className={`${svgFrame} ${className ?? ""}`}
      aria-hidden
    >
      <rect width="56" height="36" rx="5" fill="#0028A0" />
      <text
        x="7"
        y="23.5"
        fill="#FFFFFF"
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize="15"
        fontWeight="900"
        letterSpacing="-0.04em"
      >
        GLS
      </text>
      {/* Gelber Punkt auf Text-Baseline (Perioden-Position) */}
      <circle cx="41.25" cy="20.75" r="2.85" fill="#FFD200" />
    </svg>
  );
}

/** ~56×36 — Einheitliches Post-Gelb, „POST“ schwarz, DE/AT identisch. */
export function PostLogo({ className }: { className?: string }) {
  return (
    <svg
      width={56}
      height={36}
      viewBox="0 0 56 36"
      className={`${svgFrame} ${className ?? ""}`}
      aria-hidden
    >
      <rect width="56" height="36" rx="5" fill="#FFCC00" />
      <text
        x="28"
        y="23"
        textAnchor="middle"
        fill="#000000"
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize="14"
        fontWeight="800"
        letterSpacing="0.02em"
      >
        POST
      </text>
    </svg>
  );
}

export function getShippingLogo(methodName: string): ReactNode {
  const lower = methodName.toLowerCase();
  if (lower.includes("gls")) return <GlsLogo />;
  if (lower.includes("post")) return <PostLogo />;
  return null;
}
