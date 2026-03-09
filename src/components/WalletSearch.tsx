"use client";

import { useState, useMemo, useRef } from "react";
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
  const [showSuggestions, setShowSuggestions] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const scored: { wallet: PlacedWallet; score: number; matchField: string }[] = [];

    for (const w of wallets) {
      const name = w.identityName?.toLowerCase() ?? "";
      const xUser = w.xUsername?.toLowerCase() ?? "";
      const addr = w.address.toLowerCase();

      let best = -1;
      let field = "";

      // Name matches (highest priority)
      if (name && name.startsWith(q)) { best = 5; field = "name"; }
      else if (name && name.includes(q)) { best = 4; field = "name"; }

      // X handle matches
      if (xUser && xUser.startsWith(q.replace(/^@/, ""))) {
        if (best < 5) { best = 5; field = "x"; }
      } else if (xUser && xUser.includes(q.replace(/^@/, ""))) {
        if (best < 4) { best = 4; field = "x"; }
      }

      // Address matches
      if (best < 0) {
        if (addr.startsWith(q)) { best = 1; field = "address"; }
        else if (addr.includes(q)) { best = 0; field = "address"; }
      }

      if (best >= 0) scored.push({ wallet: w, score: best, matchField: field });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 3);
  }, [query, wallets]);

  function selectWallet(wallet: PlacedWallet) {
    const dims = getBuildingDimensions(wallet);
    const pos = getWalletWorldPosition(wallet, dims);
    onSelect(wallet, pos);
    setQuery("");
    setShowSuggestions(false);
    setStatus("found");
    setMessage("Flying to building...");
    setTimeout(() => setStatus("idle"), 2000);
  }

  function selectFromArray(address: string, arr: PlacedWallet[]): boolean {
    const wallet = arr.find((w) => w.address === address);
    if (!wallet) return false;
    selectWallet(wallet);
    return true;
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setShowSuggestions(false);
    const address = query.trim();
    if (!address) return;

    // If there's a top suggestion that matches, use it directly
    if (suggestions.length > 0) {
      const q = address.toLowerCase().replace(/^@/, "");
      const exact = suggestions.find(
        (s) =>
          s.wallet.identityName?.toLowerCase() === address.toLowerCase() ||
          s.wallet.xUsername?.toLowerCase() === q
      );
      if (exact) {
        selectWallet(exact.wallet);
        return;
      }
      // If there are suggestions but no exact match, use the top one
      selectWallet(suggestions[0].wallet);
      return;
    }

    // Check local wallets first
    if (selectFromArray(address, wallets)) return;

    // Not in local array — check API
    setStatus("searching");
    setMessage("Looking up wallet...");

    try {
      const res = await fetch(`/api/wallet/${address}`);
      if (res.status === 422) {
        const body = await res.json().catch(() => null);
        if (body?.isBot) {
          setStatus("error");
          setMessage("Bot activity detected — this wallet cannot be added");
          return;
        }
      }
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

  function shortAddr(addr: string) {
    return addr.slice(0, 4) + "..." + addr.slice(-4);
  }

  return (
    <form onSubmit={handleSearch} className="relative">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search by name or address..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setStatus("idle");
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => {
            blurTimeout.current = setTimeout(() => setShowSuggestions(false), 150);
          }}
          className="w-full sm:w-72 px-4 py-2.5 bg-black/50 backdrop-blur-xl border border-white/[0.08] rounded-xl text-white placeholder-white/25 font-mono text-sm focus:outline-none focus:border-[#E35930]/50 focus:ring-1 focus:ring-[#E35930]/30 transition-colors"
        />
        <button
          type="submit"
          disabled={!query.trim() || status === "searching"}
          className="px-4 py-2.5 bg-white/30 hover:bg-white/40 backdrop-blur-xl border border-white/30 rounded-xl text-white text-sm font-medium transition-colors disabled:opacity-40 cursor-pointer"
        >
          Go
        </button>
      </div>

      {showSuggestions && suggestions.length > 0 && status === "idle" && (
        <div className="absolute top-full left-0 mt-1.5 w-full sm:w-72 bg-black/80 backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden z-30">
          {suggestions.map(({ wallet: w }) => {
            const displayName = w.identityName?.replace(/@\w+/, "").trim() || null;
            const xHandle = w.xUsername || w.identityName?.match(/@(\w+)/)?.[1] || null;

            return (
              <button
                key={w.address}
                type="button"
                onMouseDown={() => {
                  clearTimeout(blurTimeout.current);
                  selectWallet(w);
                }}
                className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-white/10 transition-colors text-left cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  {displayName || xHandle ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        {displayName && (
                          <span className="text-sm text-white truncate">{displayName}</span>
                        )}
                        {xHandle && (
                          <span className="text-xs text-blue-300 truncate">@{xHandle}</span>
                        )}
                      </div>
                      <p className="text-xs text-white/30 font-mono">{shortAddr(w.address)}</p>
                    </>
                  ) : (
                    <p className="text-sm text-white font-mono">{shortAddr(w.address)}</p>
                  )}
                </div>
                <span className="text-xs text-white/20 shrink-0">{w.txnCount.toLocaleString()} txns</span>
              </button>
            );
          })}
        </div>
      )}

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
