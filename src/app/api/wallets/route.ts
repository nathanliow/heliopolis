import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export async function GET() {
  try {
    const supabase = createAdminClient();

    // Self-heal: assign positions to any unplaced complete wallets
    await supabase.rpc("repair_unplaced_wallets");

    const [walletsResult, profilesResult] = await Promise.all([
      supabase
        .from("wallets")
        .select(
          "address, txn_count, volume_traded_sol, fees_paid_sol, wallet_age_days, block_row, block_col, local_slot, unique_tokens_swapped, latest_tx_at, identity_name, identity_type, identity_category"
        )
        .not("block_row", "is", null)
        .limit(11000),
      supabase
        .from("profiles")
        .select("wallet_address, x_username")
        .not("x_username", "is", null),
    ]);

    if (walletsResult.error) {
      throw new Error(`DB error: ${walletsResult.error.message}`);
    }

    const profileMap = new Map<string, string>();
    for (const p of profilesResult.data ?? []) {
      if (p.wallet_address && p.x_username) {
        profileMap.set(p.wallet_address, p.x_username);
      }
    }

    const wallets = (walletsResult.data ?? []).map((row) => ({
      address: row.address,
      txnCount: row.txn_count,
      walletAgeDays: row.wallet_age_days,
      volumeTraded: row.volume_traded_sol,
      feesPaid: row.fees_paid_sol,
      blockRow: row.block_row,
      blockCol: row.block_col,
      localSlot: row.local_slot,
      uniqueTokensSwapped: row.unique_tokens_swapped,
      latestBlocktime: row.latest_tx_at ? Math.floor(new Date(row.latest_tx_at).getTime() / 1000) : null,
      identityName: row.identity_name ?? null,
      identityType: row.identity_type ?? null,
      identityCategory: row.identity_category ?? null,
      xUsername: profileMap.get(row.address) ?? null,
    }));

    return NextResponse.json(
      { wallets, totalPlaced: wallets.length },
      {
        headers: {
          "Cache-Control": "public, max-age=30",
        },
      }
    );
  } catch (err) {
    console.error("Wallets fetch error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
