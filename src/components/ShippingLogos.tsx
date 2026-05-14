import type { ReactNode } from "react";

const box =
  "inline-flex h-9 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-black/10";

export function GlsLogo({ className }: { className?: string }) {
  return (
    <span
      className={`${box} bg-[#FFD420] ${className ?? ""}`}
      aria-hidden
    >
      <span className="text-[11px] font-black tracking-tight text-[#8B0000]">
        GLS
      </span>
    </span>
  );
}

export function PostAtLogo({ className }: { className?: string }) {
  return (
    <span
      className={`${box} bg-[#FFCC00] ${className ?? ""}`}
      aria-hidden
    >
      <span className="flex items-center gap-0.5 pr-0.5">
        <svg width="14" height="10" viewBox="0 0 14 10" className="text-black">
          <path
            fill="currentColor"
            d="M2 5c0-1.5 1-2.5 2.5-2.5S7 3.5 7 5 6 7.5 4.5 7.5 2 6.5 2 5zm4.5-1C5.7 4 5 4.7 5 5.5S5.7 7 6.5 7 8 6.3 8 5.5 7.3 4 6.5 4z"
          />
          <path
            fill="currentColor"
            d="M8 1h4v1.5H9.2L8 3.2V1zm2 4.5h3V9H8.5L7 7.5h1.5L9 6H10l1 1.5h1V5.5z"
          />
        </svg>
        <span className="text-[10px] font-black tracking-tight text-black">
          POST
        </span>
      </span>
    </span>
  );
}

export function DeutschePostLogo({ className }: { className?: string }) {
  return (
    <span
      className={`${box} bg-[#FFCC00] ${className ?? ""}`}
      aria-hidden
    >
      <span className="flex flex-col items-center leading-none">
        <span className="text-[7px] font-bold uppercase tracking-[0.2em] text-black">
          DE
        </span>
        <span className="text-[10px] font-black tracking-tight text-black">
          POST
        </span>
      </span>
    </span>
  );
}

export function getShippingLogo(
  methodName: string,
  country: string
): ReactNode {
  const lower = methodName.toLowerCase();
  if (lower.includes("gls")) return <GlsLogo />;
  if (lower.includes("post")) {
    if (country === "AT") return <PostAtLogo />;
    if (country === "DE") return <DeutschePostLogo />;
  }
  return null;
}
