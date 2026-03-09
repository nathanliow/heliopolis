"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { WalletBuilding } from "@/types/wallet";
import CitizenCard from "./CitizenCard";
import {
  exportCardAsPng,
  downloadBlob,
  copyBlobToClipboard,
} from "@/lib/export-card";

interface CitizenCardModalProps {
  wallet: WalletBuilding;
  identityName?: string | null;
  onClose: () => void;
}

export default function CitizenCardModal({
  wallet,
  identityName,
  onClose,
}: CitizenCardModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [xHint, setXHint] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleDownload() {
    if (!cardRef.current) return;
    setLoading(true);
    try {
      const blob = await exportCardAsPng(cardRef.current);
      downloadBlob(blob, `heliopolis-${wallet.address.slice(0, 8)}.png`);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!cardRef.current) return;
    setLoading(true);
    try {
      const blob = await exportCardAsPng(cardRef.current);
      await copyBlobToClipboard(blob);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } finally {
      setLoading(false);
    }
  }

  async function handlePostOnX() {
    if (!cardRef.current) return;
    setLoading(true);
    try {
      const blob = await exportCardAsPng(cardRef.current);
      await copyBlobToClipboard(blob);
      setXHint(true);
      setTimeout(() => setXHint(false), 5000);
      const text = encodeURIComponent(
        "I'm now a citizen of Heliopolis!\n\n[paste your ID card image here]\n\nhttps://heliopolis-helius.vercel.app/"
      );
      window.open(
        `https://x.com/intent/post?text=${text}`,
        "_blank",
        "noopener,noreferrer"
      );
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative mx-4 flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-white/10 text-white/50 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M1 1l8 8M9 1l-8 8" />
          </svg>
        </button>

        {/* Card preview */}
        <div className="rounded-xl overflow-hidden shadow-2xl border border-white/[0.08]">
          <CitizenCard
            ref={cardRef}
            wallet={wallet}
            identityName={identityName}
          />
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleDownload}
            disabled={loading}
            className="px-4 py-2 bg-[#E35930]/15 hover:bg-[#E35930]/25 border border-[#E35930]/20 rounded-xl text-sm text-[#E35930] transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? "Exporting..." : "Download PNG"}
          </button>
          <button
            onClick={handleCopy}
            disabled={loading}
            className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] rounded-xl text-sm text-white/60 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {copied ? "Copied!" : "Copy to Clipboard"}
          </button>
          <button
            onClick={handlePostOnX}
            disabled={loading}
            className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] rounded-xl text-sm text-white/60 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Post on X
          </button>
        </div>
        {xHint && (
          <p className="text-xs text-white/40 text-center">
            Image copied to clipboard — paste it into your tweet
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
