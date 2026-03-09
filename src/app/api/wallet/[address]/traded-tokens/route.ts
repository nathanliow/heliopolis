import { NextRequest, NextResponse } from "next/server";
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

    const { data: wallet, error } = await supabase
      .from("wallets")
      .select("traded_token_mints")
      .eq("address", address)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`DB error: ${error.message}`);
    }

    return NextResponse.json(
      { mints: wallet?.traded_token_mints ?? [] },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch (err) {
    console.error("Traded tokens fetch error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
