"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

interface Profile {
  id: string;
  wallet_address: string | null;
  x_username: string | null;
  x_avatar_url: string | null;
}

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  connectPhantom: () => Promise<void>;
  connectX: () => Promise<void>;
  linkWallet: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(
    async (userId: string) => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      setProfile(data);
    },
    [supabase]
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user ?? null);
      if (user) fetchProfile(user.id);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUser = session?.user ?? null;
      setUser(newUser);
      if (newUser) {
        fetchProfile(newUser.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, fetchProfile]);

  const connectPhantom = useCallback(async () => {
    const provider = window.phantom?.solana;
    if (!provider?.isPhantom) {
      window.open("https://phantom.app/", "_blank");
      return;
    }

    const { publicKey } = await provider.connect();
    const walletAddress = publicKey.toString();

    const timestamp = Date.now();
    const message = `Sign in to Heliopolis\nWallet: ${walletAddress}\nTimestamp: ${timestamp}`;
    const encodedMessage = new TextEncoder().encode(message);

    const { signature } = await provider.signMessage(encodedMessage, "utf8");

    // Encode as base64 for transport
    const signatureBase64 = btoa(String.fromCharCode(...signature));
    const publicKeyBase64 = btoa(String.fromCharCode(...publicKey.toBytes()));

    const res = await fetch("/api/auth/phantom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress,
        publicKey: publicKeyBase64,
        signature: signatureBase64,
        message,
        timestamp,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Phantom auth failed");
    }

    const { token_hash } = await res.json();

    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: "magiclink",
    });

    if (error) throw error;
  }, [supabase]);

  const connectX = useCallback(async () => {
    // If already signed in (e.g. via Phantom), stash wallet so the callback
    // can transfer it to the X-authenticated user, then sign out first.
    if (user && profile?.wallet_address) {
      document.cookie = `pendingWalletLink=${profile.wallet_address}; path=/; max-age=300; samesite=lax`;
      await supabase.auth.signOut();
    }

    // Always use signInWithOAuth — avoids identity_already_exists errors
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "x",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
    if (error) throw error;
  }, [supabase, user, profile]);

  const linkWallet = useCallback(async () => {
    if (!user) return;

    const provider = window.phantom?.solana;
    if (!provider?.isPhantom) {
      window.open("https://phantom.app/", "_blank");
      return;
    }

    const { publicKey } = await provider.connect();
    const walletAddress = publicKey.toString();

    const timestamp = Date.now();
    const message = `Link wallet to Heliopolis\nWallet: ${walletAddress}\nTimestamp: ${timestamp}`;
    const encodedMessage = new TextEncoder().encode(message);

    const { signature } = await provider.signMessage(encodedMessage, "utf8");

    const signatureBase64 = btoa(String.fromCharCode(...signature));
    const publicKeyBase64 = btoa(String.fromCharCode(...publicKey.toBytes()));

    const res = await fetch("/api/auth/link-wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress,
        publicKey: publicKeyBase64,
        signature: signatureBase64,
        message,
        timestamp,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Failed to link wallet");
    }

    // Refresh profile to pick up the new wallet_address
    await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const signOut = useCallback(async () => {
    // Disconnect Phantom if connected
    try {
      await window.phantom?.solana?.disconnect();
    } catch {
      // ignore
    }
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, [supabase]);

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, connectPhantom, connectX, linkWallet, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
