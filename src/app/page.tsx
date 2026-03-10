"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const MAINTENANCE_MODE = true;
const BYPASS_PASSWORD = process.env.NEXT_PUBLIC_MAINTENANCE_PASSWORD ?? "";

const CityScene = dynamic(() => import("@/components/CityScene"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-[#0a0a12] text-white/40 text-sm">
      Loading city...
    </div>
  ),
});

export default function Home() {
  const [bypassed, setBypassed] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("maintenance_bypass") === "true") {
      setBypassed(true);
    }
  }, []);

  if (MAINTENANCE_MODE && !bypassed) {
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (password === BYPASS_PASSWORD) {
        sessionStorage.setItem("maintenance_bypass", "true");
        setBypassed(true);
      } else {
        setError(true);
        setTimeout(() => setError(false), 1500);
      }
    };

    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0a0a12] text-white gap-6">
        <div className="text-white/60 text-lg">Fixing bugs — be back shortly</div>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className={`bg-white/5 border ${error ? "border-red-500" : "border-white/10"} rounded px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none focus:border-white/30 transition-colors`}
          />
          <button
            type="submit"
            className="bg-white/10 hover:bg-white/15 border border-white/10 rounded px-3 py-1.5 text-sm text-white/60 hover:text-white/80 transition-colors"
          >
            Enter
          </button>
        </form>
      </div>
    );
  }

  return <CityScene />;
}
