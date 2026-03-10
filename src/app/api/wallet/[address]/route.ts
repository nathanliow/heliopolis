import { NextRequest, NextResponse } from "next/server";
import { WalletStats } from "@/lib/helius";
import { createAdminClient } from "@/lib/supabase-admin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;

  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    return NextResponse.json(
      { error: "Invalid Solana address" },
      { status: 400 },
    );
  }

  try {
    const supabase = createAdminClient();

    // Check if wallet already exists
    const { data: existing, error: selectError } = await supabase
      .from("wallets")
      .select(
        "address, txn_count, volume_traded_sol, fees_paid_sol, wallet_age_days, first_tx_at, ingestion_status, unique_tokens_swapped, latest_tx_at",
      )
      .eq("address", address)
      .single();

    if (selectError && selectError.code !== "PGRST116") {
      throw new Error(`DB error: ${selectError.message}`);
    }

    if (!existing) {
      return NextResponse.json(
        { error: "Wallet not found" },
        { status: 404 },
      );
    }

    const stats: WalletStats = {
      address: existing.address,
      txnCount: existing.txn_count,
      walletAgeDays: existing.wallet_age_days,
      volumeTraded: existing.volume_traded_sol,
      feesPaid: existing.fees_paid_sol,
      firstTxTimestamp: existing.first_tx_at
        ? Math.floor(new Date(existing.first_tx_at).getTime() / 1000)
        : null,
      ingestionStatus: existing.ingestion_status,
      uniqueTokensSwapped: existing.unique_tokens_swapped,
      latestBlocktime: existing.latest_tx_at
        ? Math.floor(new Date(existing.latest_tx_at).getTime() / 1000)
        : null,
    };
    return NextResponse.json(stats);
  } catch (err) {
    console.error("Wallet fetch error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
