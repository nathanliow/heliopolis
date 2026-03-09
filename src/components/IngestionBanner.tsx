"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { PlacedWallet } from "@/types/wallet";
import { getBuildingDimensions, getWalletWorldPosition } from "@/lib/building-math";

interface IngestionBannerProps {
  address: string;
  onComplete: (wallet: PlacedWallet, position: [number, number, number]) => void;
  onFailed: () => void;
  onRefetch: () => Promise<PlacedWallet[]>;
}

export default function IngestionBanner({
  address,
  onComplete,
  onFailed,
  onRefetch,
}: IngestionBannerProps) {
  const [txnsFetched, setTxnsFetched] = useState(0);
  const [ingestionPhase, setIngestionPhase] = useState<"queued" | "processing">("queued");
  const [status, setStatus] = useState<"ingesting" | "complete" | "failed">("ingesting");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/wallet/${address}`);
        if (!res.ok) return;
        const data = await res.json();

        // Use txnsFetched from queue for live progress, fall back to txnCount
        setTxnsFetched(data.txnsFetched ?? data.txnCount ?? 0);
        if (data.ingestionStatus === "processing") {
          setIngestionPhase("processing");
        }

        if (data.ingestionStatus === "complete") {
          stopPolling();
          setStatus("complete");
          const fresh = await onRefetch();
          const wallet = fresh.find((w) => w.address === address);
          if (wallet) {
            const dims = getBuildingDimensions(wallet);
            const pos = getWalletWorldPosition(wallet, dims);
            onComplete(wallet, pos);
          } else {
            onFailed();
          }
        } else if (data.ingestionStatus === "failed") {
          stopPolling();
          setStatus("failed");
          setTimeout(onFailed, 2000);
        }
      } catch {
        // Keep polling on transient errors
      }
    }, 5000);

    return stopPolling;
  }, [address, stopPolling, onRefetch, onComplete, onFailed]);

  const shortAddress = `${address.slice(0, 4)}...${address.slice(-4)}`;

  return (
    <div className="absolute top-32 left-3 right-3 sm:top-[4.5rem] sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-20">
      <div
        className={`flex items-center justify-center gap-2.5 px-5 py-2.5 rounded-full backdrop-blur-xl border transition-colors text-xs sm:text-sm ${
          status === "complete"
            ? "bg-green-900/50 border-green-500/20"
            : status === "failed"
              ? "bg-red-900/50 border-red-500/20"
              : "bg-black/50 border-white/[0.08]"
        }`}
      >
        {status === "ingesting" && (
          <span className="w-3 h-3 border-2 border-purple-400/40 border-t-purple-400 rounded-full animate-spin" />
        )}
        {status === "complete" && (
          <svg className="w-3.5 h-3.5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
        {status === "failed" && (
          <span className="text-red-400 text-sm font-bold">!</span>
        )}

        <span className="text-sm text-white/80">
          {status === "complete" ? (
            <>Building ready for <span className="font-mono text-green-300">{shortAddress}</span></>
          ) : status === "failed" ? (
            <>Indexing failed for <span className="font-mono text-red-300">{shortAddress}</span></>
          ) : (
            <>
              {ingestionPhase === "queued" ? "In queue" : "Indexing"}{" "}
              <span className="font-mono text-purple-300">{shortAddress}</span>
              {ingestionPhase === "processing" && txnsFetched > 0 && (
                <span className="text-white/40 ml-1.5">
                  — {txnsFetched.toLocaleString()} txns
                </span>
              )}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
