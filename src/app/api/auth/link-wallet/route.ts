import { NextResponse } from "next/server";

// Auth disabled — city is read-only
export async function POST() {
  return NextResponse.json({ error: "Auth disabled" }, { status: 403 });
}
