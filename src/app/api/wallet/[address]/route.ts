import { NextRequest, NextResponse } from "next/server";
import { getWalletFunding, getWalletIdentity, WalletStats } from "@/lib/helius";
import { createAdminClient } from "@/lib/supabase-admin";
import { detectBotActivity } from "@/lib/bot-detection";

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

    // Check bot cache first
    const { data: cachedBot } = await supabase
      .from("bot_wallets")
      .select("address, reason")
      .eq("address", address)
      .single();

    if (cachedBot) {
      return NextResponse.json(
        { error: cachedBot.reason ?? "Bot activity detected", isBot: true },
        { status: 422 },
      );
    }

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

    if (existing) {
      let liveIngestionStatus = existing.ingestion_status;
      let liveTxnsFetched: number | undefined;

      // When wallet isn't complete, check ingestion_queue for real-time status
      if (existing.ingestion_status !== "complete" && existing.ingestion_status !== "failed") {
        const { data: queueRow } = await supabase
          .from("ingestion_queue")
          .select("status, txns_fetched")
          .eq("address", address)
          .single();

        if (queueRow) {
          // Queue status is more up-to-date (e.g. "processing" before first batch completes)
          if (queueRow.status === "processing") {
            liveIngestionStatus = "processing";
          }
          liveTxnsFetched = queueRow.txns_fetched ?? 0;
        }
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
        ingestionStatus: liveIngestionStatus,
        uniqueTokensSwapped: existing.unique_tokens_swapped,
        latestBlocktime: existing.latest_tx_at
          ? Math.floor(new Date(existing.latest_tx_at).getTime() / 1000)
          : null,
        txnsFetched: liveTxnsFetched,
      };
      return NextResponse.json(stats);
    }

    // New wallet — fetch funding info + identity and enqueue
    const [funding, identity] = await Promise.all([
      getWalletFunding(address),
      getWalletIdentity(address),
    ]);

    let firstTxAt: string | null = null;
    let walletAgeDays = 0;

    if (funding) {
      firstTxAt = new Date(funding.timestamp * 1000).toISOString();
      walletAgeDays = Math.floor(
        (Date.now() / 1000 - funding.timestamp) / 86400,
      );
    }

    // Bot detection gate — fail open on errors
    try {
      const botResult = await detectBotActivity(address);
      if (botResult.isBot) {
        await supabase
          .from("bot_wallets")
          .upsert({ address, reason: botResult.reason }, { onConflict: "address" });
        return NextResponse.json(
          { error: botResult.reason ?? "Bot activity detected", isBot: true },
          { status: 422 },
        );
      }
    } catch (botErr) {
      console.warn("Bot detection failed, proceeding with ingestion:", botErr);
    }

    // Atomic wallet + queue insert
    const { error: enqueueError } = await supabase.rpc("enqueue_wallet", {
      p_address: address,
      p_wallet_age_days: walletAgeDays,
      p_first_tx_at: firstTxAt,
    });

    if (enqueueError) {
      console.error("Enqueue error:", enqueueError);
    }

    // Store identity if available
    if (identity) {
      await supabase
        .from("wallets")
        .update({
          identity_name: identity.name,
          identity_type: identity.type,
          identity_category: identity.category,
        })
        .eq("address", address);
    }

    // Re-query in case of race condition
    const { data: wallet } = await supabase
      .from("wallets")
      .select(
        "address, txn_count, volume_traded_sol, fees_paid_sol, wallet_age_days, first_tx_at, ingestion_status, unique_tokens_swapped, latest_tx_at",
      )
      .eq("address", address)
      .single();

    const row = wallet ?? {
      address,
      txn_count: 0,
      volume_traded_sol: 0,
      fees_paid_sol: 0,
      wallet_age_days: walletAgeDays,
      first_tx_at: firstTxAt,
      ingestion_status: "queued" as const,
      unique_tokens_swapped: 0,
      latest_tx_at: null as string | null,
    };

    const stats: WalletStats = {
      address: row.address,
      txnCount: row.txn_count,
      walletAgeDays: row.wallet_age_days,
      volumeTraded: row.volume_traded_sol,
      feesPaid: row.fees_paid_sol,
      firstTxTimestamp: row.first_tx_at
        ? Math.floor(new Date(row.first_tx_at).getTime() / 1000)
        : null,
      ingestionStatus: row.ingestion_status,
      uniqueTokensSwapped: row.unique_tokens_swapped,
      latestBlocktime: row.latest_tx_at
        ? Math.floor(new Date(row.latest_tx_at).getTime() / 1000)
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
