"use client";

import { useState } from "react";
import { PlacedWallet } from "@/types/wallet";
import { getBuildingDimensions, getWalletWorldPosition } from "@/lib/building-math";

type Status = "idle" | "searching" | "found" | "not-found" | "error";

interface WalletSearchProps {
  wallets: PlacedWallet[];
  onSelect: (wallet: PlacedWallet, position: [number, number, number]) => void;
  onRefetch: () => Promise<PlacedWallet[]>;
  onIngestionStart: (address: string) => void;
}

export default function WalletSearch({ wallets, onSelect, onRefetch, onIngestionStart }: WalletSearchProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  function selectFromArray(address: string, arr: PlacedWallet[]): boolean {
    const wallet = arr.find((w) => w.address === address);
    if (!wallet) return false;
    const dims = getBuildingDimensions(wallet);
    const pos = getWalletWorldPosition(wallet, dims);
    onSelect(wallet, pos);
    return true;
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const address = query.trim();
    if (!address) return;

    // Check local wallets first
    if (selectFromArray(address, wallets)) {
      setStatus("found");
      setMessage("Flying to building...");
      return;
    }

    // Not in local array — check API
    setStatus("searching");
    setMessage("Looking up wallet...");

    try {
      const res = await fetch(`/api/wallet/${address}`);
      if (!res.ok) {
        setStatus("not-found");
        setMessage("Wallet not found");
        return;
      }
      const data = await res.json();

      if (data.ingestionStatus === "complete" || !data.ingestionStatus) {
        // Complete but not in local array — refetch and select
        setMessage("Loading building...");
        const fresh = await onRefetch();
        if (selectFromArray(address, fresh)) {
          setStatus("found");
          setMessage("Flying to building...");
        } else {
          setStatus("not-found");
          setMessage("Wallet not yet placed in city");
        }
      } else if (data.ingestionStatus === "failed") {
        setStatus("error");
        setMessage("Wallet indexing failed");
      } else {
        // Hand off to IngestionBanner and reset search
        setStatus("idle");
        setMessage("");
        onIngestionStart(address);
      }
    } catch {
      setStatus("error");
      setMessage("Search failed");
    }
  }

  const statusColor =
    status === "found"
      ? "text-green-400/80"
      : status === "error" || status === "not-found"
        ? "text-red-400/80"
        : "text-white/50";

  return (
    <form onSubmit={handleSearch}>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search wallet address..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setStatus("idle");
          }}
          className="w-full sm:w-72 px-4 py-2.5 bg-black/50 backdrop-blur-xl border border-white/[0.08] rounded-xl text-white placeholder-white/25 font-mono text-sm focus:outline-none focus:border-purple-500/40 transition-colors"
        />
        <button
          type="submit"
          disabled={!query.trim() || status === "searching"}
          className="px-4 py-2.5 bg-white/30 hover:bg-white/40 backdrop-blur-xl border border-white/30 rounded-xl text-white text-sm font-medium transition-colors disabled:opacity-40 cursor-pointer"
        >
          Go
        </button>
      </div>
      {status !== "idle" && (
        <p className={`text-xs mt-2 text-center ${statusColor}`}>
          {status === "searching" && (
            <span className="inline-block w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5 align-middle" />
          )}
          {message}
        </p>
      )}
    </form>
  );
}
