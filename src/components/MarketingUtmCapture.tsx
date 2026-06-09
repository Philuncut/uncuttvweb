"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { persistMarketingUtmFromSearchParams } from "@/lib/marketing-utm";

export default function MarketingUtmCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    persistMarketingUtmFromSearchParams(searchParams);
  }, [searchParams]);

  return null;
}
