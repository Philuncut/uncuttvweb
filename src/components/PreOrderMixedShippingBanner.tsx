"use client";

import { useLanguage } from "@/lib/LanguageContext";
import { createT } from "@/lib/translations";

type PreOrderMixedShippingBannerProps = {
  className?: string;
  onDismiss?: () => void;
};

function AlertTriangleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export default function PreOrderMixedShippingBanner({
  className = "",
  onDismiss,
}: PreOrderMixedShippingBannerProps) {
  const { language } = useLanguage();
  const t = createT(language);

  return (
    <div
      role="status"
      className={`animate-preorder-banner-glow relative rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 ${onDismiss ? "pr-10" : ""} ${className}`}
    >
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("PREORDER_MIXED_SHIPPING_DISMISS")}
          className="absolute right-2 top-2 rounded p-1 text-amber-400/60 transition-colors hover:text-amber-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/80"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      ) : null}
      <div className="flex gap-3">
        <AlertTriangleIcon className="animate-preorder-banner-icon-pulse mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <div className="min-w-0 space-y-2 text-sm leading-relaxed text-amber-50/95">
          <p className="font-bold tracking-wide text-amber-200">
            {t("PREORDER_MIXED_SHIPPING_TITLE")}
          </p>
          <p className="text-white/85">{t("PREORDER_MIXED_SHIPPING_BODY")}</p>
          <p className="text-white/70">{t("PREORDER_MIXED_SHIPPING_HINT")}</p>
        </div>
      </div>
    </div>
  );
}