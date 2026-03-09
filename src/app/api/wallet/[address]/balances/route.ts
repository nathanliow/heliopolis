import { NextRequest, NextResponse } from "next/server";

const HELIUS_API_KEY = process.env.HELIUS_API_KEY!;
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

interface TokenInfo {
  mint: string;
  symbol?: string;
  name?: string;
  description?: string;
  image?: string;
  amount: number;
  decimals: number;
  uiAmount: number;
  price?: number;
  value?: number;
  supply?: number;
  marketCap?: number;
}

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
    // Single DAS call to get all fungible tokens with metadata, prices, and native balance
    const dasRes = await fetch(HELIUS_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAssetsByOwner",
        params: {
          ownerAddress: address,
          page: 1,
          limit: 100,
          displayOptions: {
            showFungible: true,
            showNativeBalance: true,
          },
        },
      }),
    });

    const dasJson = await dasRes.json();
    if (dasJson.error) {
      throw new Error(`DAS error: ${dasJson.error.message}`);
    }

    const result = dasJson.result;
    const solBalance = (result.nativeBalance?.lamports ?? 0) / 1e9;

    // Filter to fungible tokens with balance > 0
    const tokens: TokenInfo[] = [];
    for (const item of result.items ?? []) {
      const isFungible =
        item.interface === "FungibleToken" || item.interface === "FungibleAsset";
      if (!isFungible) continue;

      const ti = item.token_info;
      if (!ti || !ti.balance || ti.balance <= 0) continue;

      const decimals = ti.decimals ?? 0;
      const uiAmount = ti.balance / Math.pow(10, decimals);
      const price = ti.price_info?.price_per_token ?? undefined;
      const supply = ti.supply != null
        ? ti.supply / Math.pow(10, decimals)
        : undefined;

      tokens.push({
        mint: item.id,
        symbol:
          item.content?.metadata?.symbol ||
          ti.symbol ||
          undefined,
        name: item.content?.metadata?.name || undefined,
        description: item.content?.metadata?.description || undefined,
        image:
          item.content?.links?.image ||
          item.content?.files?.[0]?.cdn_uri ||
          item.content?.files?.[0]?.uri ||
          undefined,
        amount: ti.balance,
        decimals,
        uiAmount,
        price,
        value: price != null ? uiAmount * price : undefined,
        supply,
        marketCap:
          price != null && supply != null ? supply * price : undefined,
      });
    }

    // Sort by value (USD) descending, fall back to uiAmount
    tokens.sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || b.uiAmount - a.uiAmount);

    return NextResponse.json(
      {
        solBalance,
        tokenCount: tokens.length,
        tokens: tokens.slice(0, 20),
      },
      {
        headers: { "Cache-Control": "public, max-age=60" },
      },
    );
  } catch (err) {
    console.error("Balance fetch error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
