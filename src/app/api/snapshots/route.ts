import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const rawLimit = parseInt(searchParams.get("limit") ?? "30", 10);
    const limit = Math.max(1, Math.min(500, isNaN(rawLimit) ? 30 : rawLimit));

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("city_snapshots")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`DB error: ${error.message}`);
    }

    return NextResponse.json(
      { snapshots: data ?? [], count: (data ?? []).length },
      {
        headers: {
          "Cache-Control": "public, max-age=900",
        },
      }
    );
  } catch (err) {
    console.error("Snapshots fetch error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
