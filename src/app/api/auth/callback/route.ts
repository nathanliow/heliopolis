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

        // Upsert profile with X info
        await supabase.from("profiles").upsert(
          {
            id: user.id,
            x_username: xUsername ?? null,
            x_avatar_url: xAvatar ?? null,
          },
          { onConflict: "id" }
        );

        // If a wallet was pending from a Phantom session, transfer it
        const pendingWallet = cookieStore.get("pendingWalletLink")?.value;
        if (pendingWallet) {
          const admin = createAdminClient();

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
