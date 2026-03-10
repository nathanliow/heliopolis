"use client";

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
  return <CityScene />;
}
