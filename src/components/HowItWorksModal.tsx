"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

const HELIUS_DOCS = "https://docs.helius.dev";

const DATA_SOURCES = [
  {
    category: "Buildings",
    items: [
      {
        visual: "Building height",
        dataPoint: "Transaction count",
        api: "Enhanced Transactions",
        endpoint: "getTransactionsForAddress",
        doc: `${HELIUS_DOCS}/api-reference/enhanced-transactions`,
        detail: "Log-scaled txn count mapped to 1-150 floors",
      },
      {
        visual: "Building width",
        dataPoint: "Volume traded (SOL)",
        api: "Enhanced Transactions",
        endpoint: "getTransactionsForAddress",
        doc: `${HELIUS_DOCS}/api-reference/enhanced-transactions`,
        detail: "Square root-scaled relative to highest volume wallet",
      },
      {
        visual: "Lit windows",
        dataPoint: "Unique tokens swapped & recency",
        api: "Enhanced Transactions",
        endpoint: "getTransactionsForAddress",
        doc: `${HELIUS_DOCS}/api-reference/enhanced-transactions`,
        detail: "Fill ratio from token diversity, brightness from last activity",
      },
    ],
  },
  {
    category: "Wallet Info",
    items: [
      {
        visual: "Wallet age",
        dataPoint: "First funding timestamp",
        api: "Wallet API",
        endpoint: "getWalletFundedBy",
        doc: `${HELIUS_DOCS}/api-reference/wallet-api`,
        detail: "Days since first SOL transfer to this wallet",
      },
      {
        visual: "Wallet identity",
        dataPoint: "Known entity labels",
        api: "Wallet API",
        endpoint: "getWalletIdentity",
        doc: `${HELIUS_DOCS}/api-reference/wallet-api`,
        detail: "Recognizes exchanges, protocols, and notable wallets",
      },
      {
        visual: "Token balances & prices",
        dataPoint: "Fungible asset holdings",
        api: "DAS API",
        endpoint: "getAssetsByOwner",
        doc: `${HELIUS_DOCS}/api-reference/digital-asset-standard`,
        detail: "Live balances with metadata, images, and price info",
      },
      {
        visual: "Token metadata",
        dataPoint: "Name, symbol, image per mint",
        api: "DAS API",
        endpoint: "getAssetsByOwner",
        doc: `${HELIUS_DOCS}/api-reference/digital-asset-standard`,
        detail: "Token names, symbols, and images returned alongside balances",
      },
    ],
  },
  {
    category: "Live Activity",
    items: [
      {
        visual: "Cars on roads",
        dataPoint: "Real-time swap events",
        api: "Webhooks",
        endpoint: "Enhanced Webhooks",
        doc: `${HELIUS_DOCS}/api-reference/webhooks`,
        detail: "SWAP events pushed to the server, cars spawn near the swapping wallet's building",
      },
    ],
  },
] as const;

const INFRA = [
  { label: "RPC", value: "Helius Mainnet RPC", doc: `${HELIUS_DOCS}/api-reference/rpc` },
  { label: "Database", value: "Supabase (PostgreSQL)", doc: null },
  { label: "Realtime", value: "Supabase Realtime", doc: null },
  { label: "Frontend", value: "React Three Fiber + Next.js", doc: null },
] as const;

export default function HowItWorksModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-6 h-6 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors cursor-pointer"
        aria-label="How it works"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="6.5" />
          <path d="M6.5 6.5a1.5 1.5 0 1 1 1.5 1.5v1" />
          <circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto bg-[#0e0e1a]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-white">How It Works</h2>
                <p className="text-xs text-white/35 mt-0.5">Where the data comes from</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1 1l8 8M9 1l-8 8" />
                </svg>
              </button>
            </div>

            {/* Install Helius */}
            <div className="mb-5">
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2.5">
                Install Helius
              </h3>
              <div className="space-y-2">
                {[
                  { label: "CLI", command: "npm install -g helius-cli" },
                  { label: "MCP", command: "claude mcp add helius npx helius-mcp@latest" },
                  { label: "Marketplace", command: "/plugin marketplace add helius-labs/core-ai" },
                  { label: "Plugin", command: "/plugin install helius@helius-labs" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-3.5 py-3"
                  >
                    <div className="text-xs text-white/35 mb-1">{item.label}</div>
                    <code className="text-xs text-orange-300/80 font-mono">{item.command}</code>
                  </div>
                ))}
              </div>
            </div>

            {/* Data sources */}
            <div className="space-y-5">
              {DATA_SOURCES.map((group) => (
                <div key={group.category}>
                  <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2.5">
                    {group.category}
                  </h3>
                  <div className="space-y-2">
                    {group.items.map((item) => (
                      <div
                        key={item.visual}
                        className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-3.5 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm text-white/80">{item.visual}</div>
                            <div className="text-xs text-white/35 mt-0.5">{item.detail}</div>
                          </div>
                          <a
                            href={item.doc}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 px-2 py-1 bg-orange-500/10 border border-orange-500/15 rounded-lg text-xs text-orange-300/80 hover:text-orange-200 hover:bg-orange-500/15 transition-colors"
                          >
                            {item.endpoint}
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Infrastructure */}
            <div className="mt-5 pt-4 border-t border-white/[0.06]">
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2.5">
                Infrastructure
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {INFRA.map((item) => (
                  <div
                    key={item.label}
                    className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5"
                  >
                    <div className="text-xs text-white/35">{item.label}</div>
                    {item.doc ? (
                      <a
                        href={item.doc}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-white/70 hover:text-white transition-colors"
                      >
                        {item.value}
                      </a>
                    ) : (
                      <div className="text-sm text-white/70">{item.value}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between">
              <a
                href="https://www.helius.dev/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-white/30 hover:text-white/50 transition-colors"
              >
                <img src="/helius-icon.svg" alt="Helius" className="w-4 h-4" />
                <span>Powered by Helius</span>
              </a>
              <a
                href={HELIUS_DOCS}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400/60 hover:text-blue-400 transition-colors"
              >
                Full API Docs &rarr;
              </a>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
