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

/**
 * Subscribe to swap events via Supabase Realtime.
 * Returns a mutable ref to a queue — avoids React re-renders on every event.
 */
export function useSwapEvents(wallets: PlacedWallet[]): React.MutableRefObject<SwapEvent[]> {
  const queueRef = useRef<SwapEvent[]>([]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = null;
    let supabaseRef: any = null;

    import("@/lib/supabase").then(({ createClient }) => {
      const supabase = createClient();
      supabaseRef = supabase;
      channel = supabase
        .channel("swap_events_realtime")
        .on(
          "postgres_changes" as any,
          {
            event: "INSERT",
            schema: "public",
            table: "swap_events",
          },
          (payload: any) => {
            const row = payload.new;
            if (!row) return;
            const event: SwapEvent = {
              walletAddress: row.wallet_address,
              signature: row.signature,
              tokenIn: row.token_in ?? null,
              tokenOut: row.token_out ?? null,
              amountSol: row.amount_sol != null ? Number(row.amount_sol) : null,
            };
            const q = queueRef.current;
            q.push(event);
            if (q.length > MAX_QUEUE) q.splice(0, q.length - MAX_QUEUE);
          },
        )
        .subscribe();
    });

    return () => {
      if (channel && supabaseRef) {
        supabaseRef.removeChannel(channel);
      }
    };
  }, [wallets]);

  return queueRef;
}
