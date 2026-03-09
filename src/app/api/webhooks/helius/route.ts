import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  // Validate auth
  const authHeader = req.headers.get("authorization");
  const expectedSecret = process.env.HELIUS_WEBHOOK_SECRET;
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any[];
  try {
    body = await req.json();
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: "Expected array" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Get all tracked wallet addresses for cross-referencing
  const { data: walletRows } = await supabase
    .from("wallets")
    .select("address");
  const trackedAddresses = new Set(
    (walletRows ?? []).map((w: { address: string }) => w.address),
  );

  // Filter for SWAP transactions and extract swap events
  const swapRows: {
    wallet_address: string;
    signature: string;
    token_in: string | null;
    token_out: string | null;
    amount_sol: number | null;
  }[] = [];

  for (const tx of body) {
    if (tx.type !== "SWAP") continue;
    const signature = tx.signature;
    if (!signature) continue;

    // Collect all addresses in the transaction
    const addresses = new Set<string>();
    if (tx.feePayer) addresses.add(tx.feePayer);
    if (Array.isArray(tx.tokenTransfers)) {
      for (const tt of tx.tokenTransfers) {
        if (tt.fromUserAccount) addresses.add(tt.fromUserAccount);
        if (tt.toUserAccount) addresses.add(tt.toUserAccount);
      }
    }

    // Find which tracked wallet is involved
    let walletAddress: string | null = null;
    for (const addr of addresses) {
      if (trackedAddresses.has(addr)) {
        walletAddress = addr;
        break;
      }
    }
    if (!walletAddress) continue;

    // Extract token in/out from tokenTransfers
    let tokenIn: string | null = null;
    let tokenOut: string | null = null;
    let amountSol: number | null = null;

    if (Array.isArray(tx.tokenTransfers)) {
      for (const tt of tx.tokenTransfers) {
        if (tt.fromUserAccount === walletAddress && !tokenIn) {
          tokenIn = tt.mint ?? null;
        }
        if (tt.toUserAccount === walletAddress && !tokenOut) {
          tokenOut = tt.mint ?? null;
        }
      }
    }

    // Try to extract SOL amount from nativeTransfers
    if (Array.isArray(tx.nativeTransfers)) {
      for (const nt of tx.nativeTransfers) {
        if (nt.fromUserAccount === walletAddress && nt.amount) {
          amountSol = nt.amount / 1e9; // lamports to SOL
          break;
        }
      }
    }

    swapRows.push({
      wallet_address: walletAddress,
      signature,
      token_in: tokenIn,
      token_out: tokenOut,
      amount_sol: amountSol,
    });
  }

  if (swapRows.length > 0) {
    await supabase
      .from("swap_events")
      .upsert(swapRows, { onConflict: "signature", ignoreDuplicates: true });
  }

  return NextResponse.json({ received: swapRows.length });
}
