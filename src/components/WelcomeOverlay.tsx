"use client";

import { useState, useEffect, useRef } from "react";
import { WalletBuilding } from "@/types/wallet";
import { useAuth } from "@/context/AuthContext";

interface WelcomeOverlayProps {
  onExplore: () => void;
  onWalletSubmit: (wallet: WalletBuilding) => void;
  onIngestionStart: (address: string) => void;
}

export default function WelcomeOverlay({
  onExplore,
  onWalletSubmit,
  onIngestionStart,
}: WelcomeOverlayProps) {
  const { profile } = useAuth();
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasAutoSubmitted = useRef(false);

  // Auto-submit when user has a verified wallet address
  useEffect(() => {
    if (!profile?.wallet_address || hasAutoSubmitted.current || loading) return;
    hasAutoSubmitted.current = true;
    setAddress(profile.wallet_address);

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const wallet = await fetchWallet(profile.wallet_address!);
        if (
          wallet.ingestionStatus === "complete" ||
          !wallet.ingestionStatus
        ) {
          onWalletSubmit(wallet);
          setLoading(false);
        } else if (wallet.ingestionStatus === "failed") {
          setError("Transaction ingestion failed. Please try again later.");
          setLoading(false);
        } else {
          // Dismiss overlay and hand off to IngestionBanner
          setLoading(false);
          onIngestionStart(profile.wallet_address!);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.wallet_address]);

  async function fetchWallet(walletAddress: string): Promise<WalletBuilding> {
    const res = await fetch(`/api/wallet/${walletAddress}`);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      if (body?.isBot) {
        throw new Error("Bot activity detected — this wallet cannot be added to the city");
      }
      throw new Error(body?.error ?? `Request failed (${res.status})`);
    }
    const stats = await res.json();
    return {
      address: stats.address,
      txnCount: stats.txnCount,
      walletAgeDays: stats.walletAgeDays,
      volumeTraded: stats.volumeTraded,
      feesPaid: stats.feesPaid,
      ingestionStatus: stats.ingestionStatus,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = address.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    try {
      const wallet = await fetchWallet(trimmed);

      if (
        wallet.ingestionStatus === "complete" ||
        !wallet.ingestionStatus
      ) {
        onWalletSubmit(wallet);
        setLoading(false);
      } else if (wallet.ingestionStatus === "failed") {
        setError("Transaction ingestion failed. Please try again later.");
        setLoading(false);
      } else {
        // Dismiss overlay and hand off to IngestionBanner
        setLoading(false);
        onIngestionStart(trimmed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a0a12]/90 backdrop-blur-sm">
      <div className="max-w-sm w-full px-4 sm:px-6 text-center space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2.5">
            <img src="/helius-icon.svg" alt="Helius" className="w-7 h-7 sm:w-8 sm:h-8" />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "#E35930" }}>
              Heliopolis
            </h1>
          </div>
          <p className="text-sm text-white/40">
            A city powered by Helius
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Wallet address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={loading}
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/25 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#E35930]/50 focus:border-[#E35930] transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !address.trim()}
            className="w-full px-4 py-2.5 bg-[#E35930]/80 hover:bg-[#E35930] rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Looking up wallet...
              </span>
            ) : (
              "Look up wallet"
            )}
          </button>
        </form>

        {error && <p className="text-red-400/80 text-xs">{error}</p>}

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-white/20 text-xs">or</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <button
          onClick={onExplore}
          disabled={loading}
          className="w-full px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/60 text-sm transition-colors disabled:opacity-50 cursor-pointer"
        >
          Explore city
        </button>
      </div>
    </div>
  );
}
