"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

interface AuthPanelProps {
  onClickAddress?: (address: string) => void;
}

export default function AuthPanel({ onClickAddress }: AuthPanelProps) {
  const { user, profile, loading, connectPhantom, connectX, linkWallet, signOut } =
    useAuth();
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  if (loading) return null;

  async function handlePhantom() {
    setError(null);
    setConnecting(true);
    try {
      await connectPhantom();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setConnecting(false);
    }
  }

  async function handleX() {
    setError(null);
    try {
      await connectX();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect X");
    }
  }

  async function handleLinkWallet() {
    setError(null);
    setConnecting(true);
    try {
      await linkWallet();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link wallet");
    } finally {
      setConnecting(false);
    }
  }

  if (!user) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePhantom}
            disabled={connecting}
            className="flex items-center gap-2 px-2.5 md:px-4 py-2 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/20 rounded-xl text-sm text-purple-200 transition-colors disabled:opacity-50 backdrop-blur-xl cursor-pointer"
          >
            <PhantomIcon />
            <span className="hidden md:inline">{connecting ? "Signing..." : "Connect Phantom"}</span>
          </button>
          <button
            onClick={handleX}
            className="flex items-center gap-2 px-2.5 md:px-4 py-2 bg-white/30 hover:bg-white/40 border border-white/30 rounded-xl text-sm text-white transition-colors backdrop-blur-xl cursor-pointer"
          >
            <XIcon />
            <span className="hidden md:inline">Sign in with X</span>
          </button>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 bg-black/50 backdrop-blur-xl border border-white/[0.08] rounded-2xl px-4 py-2.5">
      {profile?.wallet_address && (
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <button
            onClick={() => onClickAddress?.(profile.wallet_address!)}
            className="hidden sm:inline font-mono text-sm text-purple-300/80 hover:text-purple-200 transition-colors cursor-pointer"
          >
            {profile.wallet_address.slice(0, 4)}...
            {profile.wallet_address.slice(-4)}
          </button>
        </div>
      )}
      {profile?.x_username && (
        <div className="flex items-center gap-2">
          {profile.x_avatar_url && (
            <img
              src={profile.x_avatar_url}
              alt=""
              className="w-5 h-5 rounded-full"
            />
          )}
          <span className="hidden sm:inline text-sm text-blue-300">@{profile.x_username}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        {!profile?.wallet_address && (
          <button
            onClick={handleLinkWallet}
            disabled={connecting}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/20 rounded-xl text-sm text-purple-200 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <PhantomIcon />
            <span className="hidden sm:inline">{connecting ? "..." : "Link Wallet"}</span>
          </button>
        )}
        {!profile?.x_username && (
          <button
            onClick={handleX}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-sm text-white/60 transition-colors cursor-pointer"
          >
            <XIcon />
            <span className="hidden sm:inline">Link X</span>
          </button>
        )}
        <button
          onClick={signOut}
          className="px-2 py-1 text-sm text-white/25 hover:text-white/50 transition-colors cursor-pointer"
        >
          <span className="hidden sm:inline">Disconnect</span>
          <span className="sm:hidden">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </span>
        </button>
      </div>
      {error && <p className="text-red-400 text-sm ml-2">{error}</p>}
    </div>
  );
}

function PhantomIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="128" height="128" rx="26" fill="#AB9FF2" />
      <path fillRule="evenodd" clipRule="evenodd" d="M55.6416 82.1477C50.8744 89.4525 42.8862 98.6966 32.2568 98.6966C27.232 98.6966 22.4004 96.628 22.4004 87.6424C22.4004 64.7584 53.6445 29.3335 82.6339 29.3335C99.1257 29.3335 105.697 40.7755 105.697 53.7689C105.697 70.4471 94.8739 89.5171 84.1156 89.5171C80.7013 89.5171 79.0264 87.6424 79.0264 84.6688C79.0264 83.8931 79.1552 83.0527 79.4129 82.1477C75.7409 88.4182 68.6546 94.2361 62.0192 94.2361C57.1877 94.2361 54.7397 91.1979 54.7397 86.9314C54.7397 85.3799 55.0618 83.7638 55.6416 82.1477ZM80.6133 53.3182C80.6133 57.1044 78.3795 58.9975 75.8806 58.9975C73.3438 58.9975 71.1479 57.1044 71.1479 53.3182C71.1479 49.532 73.3438 47.6389 75.8806 47.6389C78.3795 47.6389 80.6133 49.532 80.6133 53.3182ZM94.8102 53.3184C94.8102 57.1046 92.5763 58.9977 90.0775 58.9977C87.5407 58.9977 85.3447 57.1046 85.3447 53.3184C85.3447 49.5323 87.5407 47.6392 90.0775 47.6392C92.5763 47.6392 94.8102 49.5323 94.8102 53.3184Z" fill="#FFFDF8" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
