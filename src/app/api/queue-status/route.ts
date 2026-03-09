import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("wallets")
      .select("ingestion_status");

    if (error) throw new Error(error.message);

    const counts = { queued: 0, processing: 0, complete: 0, failed: 0 };
    for (const row of data ?? []) {
      const s = row.ingestion_status as keyof typeof counts;
      if (s in counts) counts[s]++;
    }

    return NextResponse.json(counts, {
      headers: { "Cache-Control": "public, max-age=10" },
    });
  } catch (err) {
    console.error("Queue status error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
