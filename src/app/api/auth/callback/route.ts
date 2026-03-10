import { NextResponse } from "next/server";

// Auth disabled — city is read-only
export async function GET(request: Request) {
  return NextResponse.redirect(new URL(request.url).origin);
}
