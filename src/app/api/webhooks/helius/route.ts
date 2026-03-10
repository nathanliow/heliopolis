import { NextResponse } from "next/server";

// Webhook ingestion disabled — the city is now read-only.
// Existing swap_events are replayed randomly by the frontend.

export async function POST() {
  return NextResponse.json({ received: 0 });
}
