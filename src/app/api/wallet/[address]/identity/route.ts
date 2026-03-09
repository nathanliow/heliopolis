import { NextResponse } from "next/server";
import { getWalletIdentity } from "@/lib/helius";
import { createAdminClient } from "@/lib/supabase-admin";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const supabase = createAdminClient();

  // Check DB first
  const { data: row } = await supabase
    .from("wallets")
    .select("identity_name, identity_type, identity_category")
    .eq("address", address)
    .single();

  if (row?.identity_name) {
    return NextResponse.json({
      identity: {
        name: row.identity_name,
        type: row.identity_type ?? "unknown",
        category: row.identity_category ?? "",
      },
    });
  }

  // Not cached — fetch from Helius and store
  const identity = await getWalletIdentity(address);

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

  return NextResponse.json(
    { identity: identity ?? null },
    {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" },
    },
  );
}
