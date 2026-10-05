"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { persistVideoUtmFromSearchParams } from "@/lib/video-utm";

export default function VideoUtmCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    persistVideoUtmFromSearchParams(searchParams);
  }, [searchParams]);

  return null;
}
