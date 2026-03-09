const HELIUS_WALLET_API = "https://api.helius.xyz/v1/wallet";

export interface WalletIdentity {
  name: string;
  type: string;
  category: string;
}

/**
 * Call Helius Wallet API identity endpoint.
 * Returns identity info for known wallets (exchanges, protocols, etc.) or null if unknown.
 */
export async function getWalletIdentity(
  address: string,
): Promise<WalletIdentity | null> {
  const url = `${HELIUS_WALLET_API}/${address}/identity?api-key=${process.env.HELIUS_API_KEY}`;
  const res = await fetch(url);

  if (res.status === 404) return null;
  if (!res.ok) return null;

  const data = await res.json();
  if (!data.name) return null;

  return {
    name: data.name,
    type: data.type ?? "unknown",
    category: data.category ?? "",
  };
}

export interface WalletFunding {
  timestamp: number;
  funder: string;
  funderName: string | null;
  amount: number;
}

export interface WalletStats {
  address: string;
  txnCount: number;
  walletAgeDays: number;
  volumeTraded: number;
  feesPaid: number;
  firstTxTimestamp: number | null;
  ingestionStatus?: "queued" | "processing" | "complete" | "failed";
  uniqueTokensSwapped?: number;
  latestBlocktime?: number | null;
  txnsFetched?: number;
}

/**
 * Call Helius Wallet API funded-by endpoint.
 * Returns funding info or null if 404 (e.g., funded via program/airdrop).
 */
export async function getWalletFunding(
  address: string,
): Promise<WalletFunding | null> {
  const url = `${HELIUS_WALLET_API}/${address}/funded-by?api-key=${process.env.HELIUS_API_KEY}`;
  const res = await fetch(url);

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Helius funded-by error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return {
    timestamp: data.timestamp,
    funder: data.funder,
    funderName: data.funderName ?? null,
    amount: data.amount,
  };
}
