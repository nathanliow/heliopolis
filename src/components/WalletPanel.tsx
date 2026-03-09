"use client";

import { useEffect, useState, lazy, Suspense } from "react";
import { WalletBuilding } from "@/types/wallet";
import { getBuildingDimensions } from "@/lib/building-math";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase";

const CitizenCardModal = lazy(() => import("./CitizenCardModal"));

interface WalletPanelProps {
  wallet: WalletBuilding | null;
  onClose: () => void;
}

interface BuildingProfile {
  x_username: string | null;
  x_avatar_url: string | null;
}

interface WalletIdentity {
  name: string;
  type: string;
  category: string;
}

interface TokenInfo {
  mint: string;
  symbol?: string;
  name?: string;
  uiAmount: number;
}

interface BalanceData {
  solBalance: number;
  tokenCount: number;
  tokens: TokenInfo[];
}

export default function WalletPanel({ wallet, onClose }: WalletPanelProps) {
  const { profile, connectX } = useAuth();
  const [buildingProfile, setBuildingProfile] =
    useState<BuildingProfile | null>(null);
  const [balances, setBalances] = useState<BalanceData | null>(null);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [showCard, setShowCard] = useState(false);

  // Identity from pre-loaded wallet data (no API call needed)
  const identity: WalletIdentity | null = wallet?.identityName
    ? { name: wallet.identityName, type: wallet.identityType ?? "unknown", category: wallet.identityCategory ?? "" }
    : null;

  // Extract @handle from identity name (formats: "@handle", "Display Name @handle")
  const identityAtMatch = identity?.name?.match(/@(\w+)/);
  const identityXHandle = identityAtMatch ? identityAtMatch[1] : null;
  const identityDisplayName = identity?.name ? identity.name.replace(/@\w+/, "").trim() || null : null;

  useEffect(() => {
    if (!wallet) {
      setBuildingProfile(null);
      setBalances(null);
      setShowCard(false);
      return;
    }

    const supabase = createClient();
    supabase
      .from("profiles")
      .select("x_username, x_avatar_url")
      .eq("wallet_address", wallet.address)
      .single()
      .then(({ data }) => setBuildingProfile(data));

    // Fetch live balances
    setBalancesLoading(true);
    fetch(`/api/wallet/${wallet.address}/balances`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) setBalances(data);
      })
      .catch(() => {})
      .finally(() => setBalancesLoading(false));
  }, [wallet]);

  if (!wallet) return null;

  const dims = getBuildingDimensions(wallet);
  const isOwner = profile?.wallet_address === wallet.address;

  function formatLastActive(blocktime: number | undefined): string {
    if (!blocktime) return "Unknown";
    const days = Math.floor((Date.now() / 1000 - blocktime) / 86400);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days} days ago`;
    if (days < 365) return `${Math.floor(days / 30)} months ago`;
    return `${(days / 365).toFixed(1)} years ago`;
  }

  function shortenMint(mint: string): string {
    return `${mint.slice(0, 4)}...${mint.slice(-4)}`;
  }

  function formatTokenAmount(amount: number): string {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(2)}K`;
    if (amount >= 1) return amount.toFixed(2);
    if (amount >= 0.001) return amount.toFixed(4);
    return amount.toExponential(2);
  }

  return (
    <div className="w-full sm:w-80 bg-black/50 backdrop-blur-xl border border-white/[0.08] rounded-t-2xl sm:rounded-2xl p-5 text-white max-h-[60vh] sm:max-h-[calc(100vh-8rem)] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">
            Wallet
          </h3>
          {(!wallet.ingestionStatus || wallet.ingestionStatus === "complete") && (
            <button
              onClick={() => setShowCard(true)}
              className="px-2 py-0.5 bg-[#E35930]/15 hover:bg-[#E35930]/25 border border-[#E35930]/20 rounded-lg text-[10px] font-medium text-[#E35930] transition-colors cursor-pointer"
            >
              ID Card
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-lg text-white/30 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M1 1l8 8M9 1l-8 8" />
          </svg>
        </button>
      </div>

      <p className="font-mono text-sm text-purple-300/80 break-all mb-5">
        {wallet.address}
      </p>

      {/* Unified identity + profile section */}
      {(() => {
        const xAvatar = buildingProfile?.x_avatar_url ?? null;
        const xHandle = buildingProfile?.x_username ?? identityXHandle;
        const displayName = identityDisplayName || (identity && !identityXHandle ? identity.name : null);
        const categoryBadge = identity && !identityXHandle ? (identity.category || identity.type) : null;
        const isVerified = !!buildingProfile || !!identityXHandle;
        const showSection = displayName || xHandle || isVerified || categoryBadge;

        return showSection ? (
          <div className="mb-5 pb-4 border-b border-white/[0.06] space-y-2.5">
            <div className="flex items-center gap-2.5">
              {xAvatar && (
                <img src={xAvatar} alt="" className="w-7 h-7 rounded-full shrink-0" />
              )}
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                {displayName && (
                  <span className="text-sm font-medium text-white/80 truncate">{displayName}</span>
                )}
                {xHandle && (
                  <a href={`https://x.com/${xHandle}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-300 hover:underline truncate">@{xHandle}</a>
                )}
                {isVerified && (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-green-500/10 border border-green-500/15 rounded-lg text-xs text-green-300 shrink-0">
                    <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Verified
                  </span>
                )}
                {categoryBadge && (
                  <span className="px-2 py-0.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-xs text-white/35 shrink-0">
                    {categoryBadge}
                  </span>
                )}
              </div>
            </div>
            {isOwner && !buildingProfile?.x_username && (
              <button
                onClick={connectX}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-sm text-white/60 transition-colors cursor-pointer"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Connect X to your building
              </button>
            )}
          </div>
        ) : null;
      })()}

      {wallet.ingestionStatus && wallet.ingestionStatus !== "complete" && (
        <div
          className={`mb-4 px-3 py-2 rounded-xl text-sm ${
            wallet.ingestionStatus === "failed"
              ? "bg-red-500/10 border border-red-500/15 text-red-300"
              : "bg-yellow-500/10 border border-yellow-500/15 text-yellow-200"
          }`}
        >
          {wallet.ingestionStatus === "failed"
            ? "Ingestion failed"
            : wallet.ingestionStatus === "processing"
              ? "Processing transactions..."
              : "Queued for processing"}
        </div>
      )}

      {isOwner && (
        <div className="mb-4 px-3 py-2 bg-purple-500/10 border border-purple-500/15 rounded-xl text-sm text-purple-200">
          This is your building
        </div>
      )}

      {/* Balances */}
      <div className="mb-5 pb-4 border-b border-white/[0.06] space-y-2.5">
        <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
          Balances
        </h4>
        {balancesLoading ? (
          <p className="text-sm text-white/30">Loading balances...</p>
        ) : balances ? (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-white/45">SOL Balance</span>
              <span className="font-mono text-white/80">
                {balances.solBalance.toLocaleString(undefined, {
                  maximumFractionDigits: 4,
                })}{" "}
                SOL
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/45">Token Accounts</span>
              <span className="font-mono text-white/80">{balances.tokenCount}</span>
            </div>
          </>
        ) : (
          <p className="text-sm text-white/30">Unable to load balances</p>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-white/45">Unique Tokens Swapped</span>
          <span className="font-mono text-white/80">
            {wallet.uniqueTokensSwapped ?? 0}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-white/45">Last Active</span>
          <span className="font-mono text-white/80">
            {formatLastActive(wallet.latestBlocktime)}
          </span>
        </div>
      </div>

      {/* Top tokens */}
      {balances && balances.tokens.length > 0 && (
        <div className="mb-5 pb-4 border-b border-white/[0.06]">
          <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2.5">
            Top Tokens
          </h4>
          <div className="space-y-1.5">
            {balances.tokens.map((t) => (
              <div
                key={t.mint}
                className="flex justify-between items-center text-sm"
              >
                <span className="text-white/60 truncate mr-3">
                  {t.symbol || t.name || shortenMint(t.mint)}
                </span>
                <span className="font-mono text-white/45 shrink-0">
                  {formatTokenAmount(t.uiAmount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="space-y-2.5 text-sm">
        <div className="flex justify-between">
          <span className="text-white/45">Transactions</span>
          <span className="font-mono text-white/80">
            {wallet.txnCount.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/45">Age</span>
          <span className="font-mono text-white/80">{wallet.walletAgeDays} days</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/45">Volume</span>
          <span className="font-mono text-white/80">
            {wallet.volumeTraded.toLocaleString()} SOL
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/45">Fees Paid</span>
          <span className="font-mono text-white/80">
            {wallet.feesPaid.toLocaleString()} SOL
          </span>
        </div>
      </div>

      {/* Building dimensions */}
      <div className="mt-5 pt-4 border-t border-white/[0.06] space-y-1.5 text-xs text-white/30">
        <div className="flex justify-between">
          <span>Height</span>
          <span className="font-mono">{dims.height.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Width (volume)</span>
          <span className="font-mono">{dims.width.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Depth (age)</span>
          <span className="font-mono">{dims.depth.toFixed(2)}</span>
        </div>
      </div>

      {showCard && (
        <Suspense fallback={null}>
          <CitizenCardModal
            wallet={wallet}
            identityName={
              buildingProfile?.x_username
                ? `@${buildingProfile.x_username}`
                : identityDisplayName || identity?.name || null
            }
            onClose={() => setShowCard(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
