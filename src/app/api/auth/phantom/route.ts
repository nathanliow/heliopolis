import { NextResponse } from "next/server";
import nacl from "tweetnacl";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
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

    const supabase = createAdminClient();
    const email = `${walletAddress}@phantom.wallet`;

    // Create user if not exists (will error if already registered - that's ok)
    const { error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { wallet_address: walletAddress },
    });

    if (
      createError &&
      !createError.message.toLowerCase().includes("already been registered")
    ) {
      return NextResponse.json(
        { error: createError.message },
        { status: 500 }
      );
    }

    // Generate magic link to create a session token
    const { data: linkData, error: linkError } =
      await supabase.auth.admin.generateLink({
        type: "magiclink",
        email,
      });

    if (linkError || !linkData) {
      return NextResponse.json(
        { error: linkError?.message ?? "Failed to generate session" },
        { status: 500 }
      );
    }

    // Upsert profile
    await supabase.from("profiles").upsert(
      {
        id: linkData.user.id,
        wallet_address: walletAddress,
      },
      { onConflict: "id" }
    );

    return NextResponse.json({
      token_hash: linkData.properties.hashed_token,
    });
  } catch (err) {
    console.error("Phantom auth error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
