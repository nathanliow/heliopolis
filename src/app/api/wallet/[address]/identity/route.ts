import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const supabase = createAdminClient();

  // Read-only — return cached identity, no writes
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

  return NextResponse.json(
    { identity: null },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" } },
  );
}
