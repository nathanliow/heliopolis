"use client";

interface SwapInfo {
  walletAddress: string;
  signature: string;
  tokenIn: string | null;
  tokenOut: string | null;
  amountSol: number | null;
}

interface SwapPanelProps {
  swap: SwapInfo | null;
  onClose: () => void;
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function formatAmount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.0001) return n.toFixed(6);
  return n.toExponential(2);
}

export default function SwapPanel({ swap, onClose }: SwapPanelProps) {
  if (!swap) return null;

  return (
    <div className="w-full sm:w-80 bg-black/50 backdrop-blur-xl border border-white/[0.08] rounded-t-2xl sm:rounded-2xl p-5 text-white">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">
          Swap
        </h3>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-lg text-white/30 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M1 1l8 8M9 1l-8 8" />
          </svg>
        </button>
      </div>

      {/* Wallet address */}
      <p className="font-mono text-sm text-purple-300/80 break-all mb-5">
        {swap.walletAddress}
      </p>

      {/* Swap direction */}
      <div className="mb-5 pb-4 border-b border-white/[0.06]">
        <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
          Direction
        </h4>
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-white/35 mb-1">Sold</div>
            <div className="font-mono text-sm text-white/70 truncate">
              {swap.tokenIn ? shortenAddress(swap.tokenIn) : "Unknown"}
            </div>
          </div>
          <div className="text-white/25 text-lg shrink-0">&rarr;</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-white/35 mb-1">Bought</div>
            <div className="font-mono text-sm text-white/70 truncate">
              {swap.tokenOut ? shortenAddress(swap.tokenOut) : "Unknown"}
            </div>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="mb-5 pb-4 border-b border-white/[0.06] space-y-2.5 text-sm">
        {swap.amountSol != null && (
          <div className="flex justify-between">
            <span className="text-white/45">Amount</span>
            <span className="font-mono text-white/80">{formatAmount(swap.amountSol)} SOL</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-white/45">Signature</span>
          <span className="font-mono text-white/60 truncate ml-4 max-w-[160px]">
            {shortenAddress(swap.signature)}
          </span>
        </div>
      </div>

      {/* Links */}
      <div className="space-y-2">
        <a
          href={`https://orbmarkets.io/tx/${swap.signature}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between w-full px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-sm text-white/60 hover:text-white/80 transition-colors"
        >
          <span>View on Orb</span>
          <span className="text-white/30">&rarr;</span>
        </a>
      </div>
    </div>
  );
}
