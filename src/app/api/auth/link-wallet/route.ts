import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import nacl from "tweetnacl";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    // Authenticate via server client with cookies
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { walletAddress, publicKey, signature, message, timestamp } =
      await request.json();

    // Verify timestamp is recent (5 minutes)
    if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) {
      return NextResponse.json(
        { error: "Message expired" },
        { status: 400 }
      );
    }

    // Decode from base64
    const sigBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    const pubkeyBytes = Uint8Array.from(atob(publicKey), (c) =>
      c.charCodeAt(0)
    );
    const messageBytes = new TextEncoder().encode(message);

    // Verify signature
    const isValid = nacl.sign.detached.verify(
      messageBytes,
      sigBytes,
      pubkeyBytes
    );
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // Use admin client for DB operations (bypasses RLS)
    const admin = createAdminClient();

    // Check for duplicate wallet claim
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("wallet_address", walletAddress)
      .single();

    if (existing && existing.id !== user.id) {
      return NextResponse.json(
        { error: "Wallet already linked to another account" },
        { status: 409 }
      );
    }

    // Update profile with wallet address
    await admin
      .from("profiles")
      .update({ wallet_address: walletAddress })
      .eq("id", user.id);

    return NextResponse.json({ wallet_address: walletAddress });
  } catch (err) {
    console.error("Link wallet error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
