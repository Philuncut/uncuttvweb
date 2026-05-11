"use client";

import dynamic from "next/dynamic";

function DashboardChunkSkeleton() {
  return (
    <div className="min-h-[50vh] animate-pulse space-y-6" aria-hidden>
      <div className="h-9 w-2/3 max-w-sm rounded bg-white/10" />
      <div className="h-10 w-full max-w-md rounded bg-white/5" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="aspect-square rounded bg-white/5" />
        ))}
      </div>
    </div>
  );
}

const HaendlerDashboard = dynamic(() => import("@/components/HaendlerDashboard"), {
  ssr: false,
  loading: () => <DashboardChunkSkeleton />,
});

export default function HaendlerDashboardGate() {
  return <HaendlerDashboard />;
}
