"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function NavigationProgress() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    setLoading(true);
    setWidth(0);

    const t1 = setTimeout(() => setWidth(70), 50);
    const t2 = setTimeout(() => setWidth(90), 300);
    const t3 = setTimeout(() => setWidth(100), 500);
    const t4 = setTimeout(() => {
      setLoading(false);
      setWidth(0);
    }, 700);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [pathname]);

  if (!loading) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        height: "3px",
        width: `${width}%`,
        backgroundColor: "#c0392b",
        boxShadow: "0 0 10px rgba(192,57,43,0.8)",
        transition: "width 0.3s ease",
        zIndex: 9999,
      }}
    />
  );
}
