"use client";

const MAINTENANCE_MODE = true;

import dynamic from "next/dynamic";

const CityScene = dynamic(() => import("@/components/CityScene"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-[#0a0a12] text-white/40 text-sm">
      Loading city...
    </div>
  ),
});

export default function Home() {
  if (MAINTENANCE_MODE) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0a0a12] text-white gap-4">
        <div className="text-4xl font-bold tracking-tight">Heliopolis</div>
        <div className="text-white/60 text-lg">Fixing bugs — be back shortly</div>
      </div>
    );
  }

  return <CityScene />;
}
