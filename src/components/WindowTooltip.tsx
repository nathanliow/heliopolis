"use client";

import { useEffect, useState } from "react";

interface TokenInfo {
  mint: string;
  symbol?: string;
  name?: string;
  description?: string;
  image?: string;
  uiAmount?: number;
  price?: number;
  value?: number;
  supply?: number;
  marketCap?: number;
  lastTraded?: number;
}

export interface WindowHoverInfo {
  address: string;
  tokenIndex: number;
  screenX: number;
  screenY: number;
  mode: "building" | "token" | "swap";
  // Identity fields (pre-loaded from wallets bulk response)
  identityName?: string | null;
  identityType?: string | null;
  identityCategory?: string | null;
  // Swap-specific fields (only when mode === "swap")
  swapSignature?: string;
  swapTokenIn?: string;
  swapTokenOut?: string;
  swapAmountSol?: number;
}

const tokenCache = new Map<string, TokenInfo[]>();
const pendingBalances = new Set<string>();
const pendingTraded = new Set<string>();

function formatNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.001) return n.toFixed(4);
  return n.toExponential(2);
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  if (n >= 0.01) return `$${n.toFixed(2)}`;
  if (n > 0) return `$${n.toFixed(6)}`;
  return "$0";
}

function formatTimeAgo(unixTimestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - unixTimestamp);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

// Intermediate caches for merging
const balancesCache = new Map<string, TokenInfo[]>();
const tradedCache = new Map<string, TokenInfo[]>();

function mergeTokens(address: string): TokenInfo[] {
  const balances = balancesCache.get(address) ?? [];
  const traded = tradedCache.get(address) ?? [];

  // Build a lookup of lastTraded timestamps from traded list
  const tradedMap = new Map<string, TokenInfo>();
  for (const t of traded) {
    tradedMap.set(t.mint, t);
  }

  const seen = new Set<string>();
  const combined: TokenInfo[] = [];

  // Current holdings first — merge in lastTraded if available
  for (const t of balances) {
    seen.add(t.mint);
    const tradedInfo = tradedMap.get(t.mint);
    combined.push(tradedInfo?.lastTraded != null ? { ...t, lastTraded: tradedInfo.lastTraded } : t);
  }

  // Then historical traded tokens not currently held
  for (const t of traded) {
    if (!seen.has(t.mint)) {
      seen.add(t.mint);
      combined.push(t);
    }
  }

  return combined;
}

// --- Building profile cache ---
interface BuildingProfile {
  x_username: string | null;
  x_avatar_url: string | null;
}

const profileCache = new Map<string, BuildingProfile | null>();
const pendingProfiles = new Set<string>();

function BuildingTooltip({
  address,
  screenX,
  screenY,
  identityName,
  identityType,
  identityCategory,
}: {
  address: string;
  screenX: number;
  screenY: number;
  identityName?: string | null;
  identityType?: string | null;
  identityCategory?: string | null;
}) {
  const [profile, setProfile] = useState<BuildingProfile | null | undefined>(
    profileCache.has(address) ? profileCache.get(address)! : undefined,
  );

  useEffect(() => {
    if (profileCache.has(address)) {
      setProfile(profileCache.get(address)!);
    } else if (!pendingProfiles.has(address)) {
      pendingProfiles.add(address);
      import("@/lib/supabase").then(({ createClient }) => {
        const supabase = createClient();
        Promise.resolve(
          supabase
            .from("profiles")
            .select("x_username, x_avatar_url")
            .eq("wallet_address", address)
            .single()
        )
          .then(({ data }) => {
            profileCache.set(address, data ?? null);
            pendingProfiles.delete(address);
            setProfile(data ?? null);
          })
          .catch(() => {
            profileCache.set(address, null);
            pendingProfiles.delete(address);
            setProfile(null);
          });
      });
    }
  }, [address]);

  // Identity is pre-loaded from the wallets bulk response — no fetch needed
  const identity = identityName ? { name: identityName, type: identityType ?? "unknown", category: identityCategory ?? "" } : null;

  // Extract @handle from identity name (formats: "@handle", "Display Name @handle")
  const identityAtMatch = identity?.name?.match(/@(\w+)/);
  const identityXHandle = identityAtMatch ? identityAtMatch[1] : null;
  const identityDisplayName = identity?.name ? identity.name.replace(/@\w+/, "").trim() || null : null;

  const shortAddress = `${address.slice(0, 4)}...${address.slice(-4)}`;
  const isVerified = profile !== undefined && profile !== null;
  const hasX = (isVerified && !!profile.x_username) || !!identityXHandle;
  const xUsername = profile?.x_username ?? identityXHandle;
  const xAvatar = profile?.x_avatar_url ?? null;

  const tooltipWidth = 220;
  const tooltipHeight = 80;
  let left = screenX + 16;
  let top = screenY - 12;
  if (typeof window !== "undefined") {
    if (left + tooltipWidth > window.innerWidth - 8) left = screenX - tooltipWidth - 8;
    if (top + tooltipHeight > window.innerHeight - 8) top = screenY - tooltipHeight;
    if (top < 8) top = 8;
  }

  return (
    <div
      className="fixed z-50 bg-black/60 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-3.5 pointer-events-none"
      style={{ left, top, width: tooltipWidth }}
    >
      {/* Row 1: Display name */}
      {profile === undefined && !identity ? (
        <div className="text-xs text-white/30 mb-1">Loading...</div>
      ) : identityDisplayName ? (
        <div className="flex items-center gap-2 mb-1">
          {xAvatar && (
            <img src={xAvatar} alt="" className="w-5 h-5 rounded-full shrink-0" />
          )}
          <span className="text-sm font-medium text-white/80 truncate">{identityDisplayName}</span>
        </div>
      ) : identity && !identityXHandle ? (
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-white/80 truncate">{identity.name}</span>
          <span className="px-1.5 py-0.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-xs text-white/35 shrink-0">
            {identity.category || identity.type}
          </span>
        </div>
      ) : null}

      {/* Row 2: X handle + verified badge */}
      {hasX ? (
        <div className="flex items-center gap-2 mb-1.5">
          {!identityDisplayName && xAvatar && (
            <img src={xAvatar} alt="" className="w-5 h-5 rounded-full shrink-0" />
          )}
          <a href={`https://x.com/${xUsername}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-300 truncate hover:underline pointer-events-auto">@{xUsername}</a>
          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-green-500/10 border border-green-500/15 rounded-lg text-xs text-green-300 shrink-0">
            <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Verified
          </span>
        </div>
      ) : isVerified ? (
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-green-500/10 border border-green-500/15 rounded-lg text-xs text-green-300">
            <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Verified
          </span>
        </div>
      ) : !identity ? (
        <div className="text-xs text-white/30 mb-1.5">Unverified</div>
      ) : null}

      {/* Row 3: Wallet address */}
      <div className="font-mono text-xs text-purple-300/50">{shortAddress}</div>
    </div>
  );
}

// --- Token tooltip (existing logic) ---
function TokenTooltip({ address, tokenIndex, screenX, screenY }: { address: string; tokenIndex: number; screenX: number; screenY: number }) {
  const [tokens, setTokens] = useState<TokenInfo[] | null>(
    tokenCache.get(address) ?? null,
  );

  useEffect(() => {
    if (tokenCache.has(address)) {
      setTokens(tokenCache.get(address)!);
      return;
    }

    let balancesDone = balancesCache.has(address);
    let tradedDone = tradedCache.has(address);

    const tryMerge = () => {
      if (balancesDone && tradedDone) {
        const merged = mergeTokens(address);
        tokenCache.set(address, merged);
        setTokens(merged);
      }
    };

    if (!balancesDone && !pendingBalances.has(address)) {
      pendingBalances.add(address);
      fetch(`/api/wallet/${address}/balances`)
        .then((r) => r.json())
        .then((data) => {
          balancesCache.set(address, data.tokens ?? []);
          pendingBalances.delete(address);
          balancesDone = true;
          tryMerge();
        })
        .catch(() => {
          pendingBalances.delete(address);
          balancesCache.set(address, []);
          balancesDone = true;
          tryMerge();
        });
    }

    if (!tradedDone && !pendingTraded.has(address)) {
      pendingTraded.add(address);
      fetch(`/api/wallet/${address}/traded-tokens`)
        .then((r) => r.json())
        .then((data) => {
          const traded: TokenInfo[] = (data.mints ?? []).map((m: any) => ({
            mint: m.mint,
            symbol: m.symbol,
            name: m.name,
            image: m.image,
            lastTraded: m.lastTraded,
          }));
          tradedCache.set(address, traded);
          pendingTraded.delete(address);
          tradedDone = true;
          tryMerge();
        })
        .catch(() => {
          pendingTraded.delete(address);
          tradedCache.set(address, []);
          tradedDone = true;
          tryMerge();
        });
    }

    if (balancesDone && tradedDone) {
      tryMerge();
    }
  }, [address]);

  if (!tokens || tokens.length === 0) return null;

  const token = tokens[tokenIndex % tokens.length];
  const label =
    token.symbol ||
    token.name ||
    `${token.mint.slice(0, 4)}...${token.mint.slice(-4)}`;

  const tooltipWidth = 240;
  const tooltipHeight = 180;
  let left = screenX + 16;
  let top = screenY - 12;
  if (typeof window !== "undefined") {
    if (left + tooltipWidth > window.innerWidth - 8) left = screenX - tooltipWidth - 8;
    if (top + tooltipHeight > window.innerHeight - 8) top = screenY - tooltipHeight;
    if (top < 8) top = 8;
  }

  return (
    <div
      className="fixed z-50 bg-black/60 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-3.5 pointer-events-none"
      style={{ left, top, width: tooltipWidth }}
    >
      <div className="flex items-center gap-2.5 mb-2.5">
        {token.image && (
          <img src={token.image} alt="" className="w-6 h-6 rounded-full shrink-0" />
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium text-white truncate">{label}</div>
          {token.name && token.symbol && token.name !== token.symbol && (
            <div className="text-xs text-white/35 truncate">{token.name}</div>
          )}
        </div>
      </div>

      <div className="space-y-1.5 text-xs">
        {token.uiAmount != null && (
          <div className="flex justify-between">
            <span className="text-white/35">Balance</span>
            <span className="text-white/70 font-mono">{formatNum(token.uiAmount)}</span>
          </div>
        )}
        {token.price != null && (
          <div className="flex justify-between">
            <span className="text-white/35">Price</span>
            <span className="text-white/70 font-mono">{formatUsd(token.price)}</span>
          </div>
        )}
        {token.value != null && (
          <div className="flex justify-between">
            <span className="text-white/35">Value</span>
            <span className="text-white/70 font-mono">{formatUsd(token.value)}</span>
          </div>
        )}
        {token.supply != null && (
          <div className="flex justify-between">
            <span className="text-white/35">Supply</span>
            <span className="text-white/70 font-mono">{formatNum(token.supply)}</span>
          </div>
        )}
        {token.marketCap != null && token.marketCap > 0 && (
          <div className="flex justify-between">
            <span className="text-white/35">Market Cap</span>
            <span className="text-white/70 font-mono">{formatUsd(token.marketCap)}</span>
          </div>
        )}
        {token.lastTraded != null && (
          <div className="flex justify-between">
            <span className="text-white/35">Last traded</span>
            <span className="text-white/70 font-mono">{formatTimeAgo(token.lastTraded)}</span>
          </div>
        )}
      </div>

      <div className="mt-2.5 pt-2 border-t border-white/[0.06] text-xs text-white/20 font-mono truncate">
        {token.mint}
      </div>
    </div>
  );
}

// --- Swap tooltip ---
function SwapTooltip({
  address,
  screenX,
  screenY,
  signature,
  tokenIn,
  tokenOut,
  amountSol,
}: {
  address: string;
  screenX: number;
  screenY: number;
  signature?: string;
  tokenIn?: string;
  tokenOut?: string;
  amountSol?: number;
}) {
  const shortAddress = `${address.slice(0, 4)}...${address.slice(-4)}`;
  const shortMint = (mint?: string) =>
    mint ? `${mint.slice(0, 4)}...${mint.slice(-4)}` : "???";

  const tooltipWidth = 240;
  const tooltipHeight = 130;
  let left = screenX + 16;
  let top = screenY - 12;
  if (typeof window !== "undefined") {
    if (left + tooltipWidth > window.innerWidth - 8) left = screenX - tooltipWidth - 8;
    if (top + tooltipHeight > window.innerHeight - 8) top = screenY - tooltipHeight;
    if (top < 8) top = 8;
  }

  return (
    <div
      className="fixed z-50 bg-black/60 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-3.5"
      style={{ left, top, width: tooltipWidth, pointerEvents: "auto", cursor: "default" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-orange-300/80 font-medium">SWAP</span>
        <span className="font-mono text-xs text-purple-300/50">{shortAddress}</span>
      </div>

      <div className="flex items-center gap-1.5 text-sm text-white/70 mb-2">
        <span className="font-mono text-xs">{shortMint(tokenIn)}</span>
        <span className="text-white/30">&rarr;</span>
        <span className="font-mono text-xs">{shortMint(tokenOut)}</span>
      </div>

      {amountSol != null && (
        <div className="flex justify-between text-xs mb-2">
          <span className="text-white/35">Amount</span>
          <span className="text-white/70 font-mono">{formatNum(amountSol)} SOL</span>
        </div>
      )}

      {signature && (
        <a
          href={`https://orbmarkets.io/tx/${signature}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-xs text-blue-400/60 hover:text-blue-400 transition-colors truncate cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          View on Orb &rarr;
        </a>
      )}
    </div>
  );
}

export default function WindowTooltip(props: WindowHoverInfo) {
  if (props.mode === "building") {
    return (
      <BuildingTooltip
        address={props.address}
        screenX={props.screenX}
        screenY={props.screenY}
        identityName={props.identityName}
        identityType={props.identityType}
        identityCategory={props.identityCategory}
      />
    );
  }
  if (props.mode === "swap") {
    return (
      <SwapTooltip
        address={props.address}
        screenX={props.screenX}
        screenY={props.screenY}
        signature={props.swapSignature}
        tokenIn={props.swapTokenIn}
        tokenOut={props.swapTokenOut}
        amountSol={props.swapAmountSol}
      />
    );
  }
  return <TokenTooltip address={props.address} tokenIndex={props.tokenIndex} screenX={props.screenX} screenY={props.screenY} />;
}
