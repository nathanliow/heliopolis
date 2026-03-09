"use client";

import { useState, useEffect } from "react";

interface QueueCounts {
  queued: number;
  processing: number;
  complete: number;
  failed: number;
}

export default function QueueStatusBanner() {
  const [counts, setCounts] = useState<QueueCounts | null>(null);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const res = await fetch("/api/queue-status");
        if (res.ok && active) setCounts(await res.json());
      } catch { /* ignore */ }
    }

    poll();
    const id = setInterval(poll, 10_000);
    return () => { active = false; clearInterval(id); };
  }, []);

  if (!counts) return null;

  const total = counts.queued + counts.processing + counts.complete + counts.failed;
  const pending = counts.queued + counts.processing;

  // Hide when everything is done
  if (pending === 0) return null;

  const pct = total > 0 ? Math.round((counts.complete / total) * 100) : 0;

  return (
    <div className="absolute top-[5.5rem] left-3 sm:top-[7.5rem] sm:left-5 z-10 bg-black/50 backdrop-blur-xl border border-white/[0.08] rounded-2xl px-4 py-3 w-[220px]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E35930] opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#E35930]" />
        </span>
        <span className="text-xs font-medium text-white/70">Indexing Pipeline</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden mb-2.5">
        <div
          className="h-full bg-[#E35930] rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Stats */}
      <div className="space-y-1.5 text-[11px]">
        <div className="flex justify-between">
          <span className="text-white/40">Complete</span>
          <span className="text-white/70 font-mono">{counts.complete}/{total}</span>
        </div>
        {counts.processing > 0 && (
          <div className="flex justify-between">
            <span className="text-white/40">Processing</span>
            <span className="text-[#E35930] font-mono">{counts.processing}</span>
          </div>
        )}
        {counts.queued > 0 && (
          <div className="flex justify-between">
            <span className="text-white/40">Queued</span>
            <span className="text-yellow-400/80 font-mono">{counts.queued}</span>
          </div>
        )}
      </div>

      {/* Throughput info */}
      <div className="mt-2.5 pt-2.5 border-t border-white/[0.06] space-y-1 text-[10px] text-white/30">
        <p>25 concurrent workers</p>
        <p>~4k txns / 10s per worker</p>
      </div>
    </div>
  );
}
