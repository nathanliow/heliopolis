export interface WalletBuilding {
  address: string;
  txnCount: number;
  walletAgeDays: number;
  volumeTraded: number; // in SOL
  feesPaid: number; // in SOL
  ingestionStatus?: "queued" | "processing" | "complete" | "failed";
  uniqueTokensSwapped?: number;
  latestBlocktime?: number; // unix seconds
  identityName?: string | null;
  identityType?: string | null;
  identityCategory?: string | null;
  xUsername?: string | null;
}

export interface PlacedWallet extends WalletBuilding {
  blockRow: number;
  blockCol: number;
  localSlot: number;
}
