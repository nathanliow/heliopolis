"use client";

import { useEffect, useRef } from "react";
import { PlacedWallet } from "@/types/wallet";

export interface SwapEvent {
  walletAddress: string;
  signature: string;
  tokenIn: string | null;
  tokenOut: string | null;
  amountSol: number | null;
}

const MAX_QUEUE = 60;
const POLL_INTERVAL = 4000; // fetch a batch every 4 seconds
const BATCH_SIZE = 3; // swaps per batch

/**
 * Periodically fetch random existing swap events from the DB
 * to keep cars spawning without needing live webhook data.
 */
export function useSwapEvents(wallets: PlacedWallet[]): React.MutableRefObject<SwapEvent[]> {
  const queueRef = useRef<SwapEvent[]>([]);

  useEffect(() => {
    if (wallets.length === 0) return;

    let cancelled = false;

    async function fetchRandomSwaps() {
      try {
        const { createClient } = await import("@/lib/supabase");
        const supabase = createClient();

        // Fetch random existing swap events
        const { data } = await supabase
          .rpc("get_random_swaps", { n: BATCH_SIZE });

        if (cancelled || !data) return;

        for (const row of data) {
          const event: SwapEvent = {
            walletAddress: row.wallet_address,
            signature: `${row.signature}-${Date.now()}`, // unique key so car system treats as new
            tokenIn: row.token_in ?? null,
            tokenOut: row.token_out ?? null,
            amountSol: row.amount_sol != null ? Number(row.amount_sol) : null,
          };
          const q = queueRef.current;
          q.push(event);
          if (q.length > MAX_QUEUE) q.splice(0, q.length - MAX_QUEUE);
        }
      } catch {
        // Silently ignore — cars just won't spawn this cycle
      }
    }

    // Initial fetch after short delay
    const initialTimeout = setTimeout(fetchRandomSwaps, 2000);
    const interval = setInterval(fetchRandomSwaps, POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [wallets]);

  return queueRef;
}
