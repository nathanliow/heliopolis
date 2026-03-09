import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
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

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const xUsername =
          user.user_metadata?.preferred_username ??
          user.user_metadata?.user_name;
        const xAvatar = user.user_metadata?.avatar_url;

        const admin = createAdminClient();

        // Check if another profile with the same X username already has a wallet
        let walletToTransfer: string | null = null;
        if (xUsername) {
          const { data: existingProfile } = await admin
            .from("profiles")
            .select("id, wallet_address")
            .eq("x_username", xUsername)
            .neq("id", user.id)
            .not("wallet_address", "is", null)
            .single();

          if (existingProfile?.wallet_address) {
            walletToTransfer = existingProfile.wallet_address;
            // Strip the old profile clean so it doesn't appear as a duplicate
            await admin
              .from("profiles")
              .update({ wallet_address: null, x_username: null, x_avatar_url: null })
              .eq("id", existingProfile.id);
          }
        }

        // Upsert profile with X info (and transferred wallet if found)
        await admin.from("profiles").upsert(
          {
            id: user.id,
            x_username: xUsername ?? null,
            x_avatar_url: xAvatar ?? null,
            ...(walletToTransfer ? { wallet_address: walletToTransfer } : {}),
          },
          { onConflict: "id" }
        );

        // If a wallet was pending from a Phantom session, transfer it
        const pendingWallet = cookieStore.get("pendingWalletLink")?.value;
        if (pendingWallet) {
          // Clear wallet from any other profile to avoid unique constraint violations
          await admin
            .from("profiles")
            .update({ wallet_address: null })
            .eq("wallet_address", pendingWallet)
            .neq("id", user.id);

          // Assign wallet to this user
          await admin
            .from("profiles")
            .update({ wallet_address: pendingWallet })
            .eq("id", user.id);

          // Clear the cookie
          cookieStore.set("pendingWalletLink", "", { maxAge: 0, path: "/" });
        }
      }

      return NextResponse.redirect(origin);
    }
  }

  return NextResponse.redirect(`${new URL(request.url).origin}?error=auth`);
}
