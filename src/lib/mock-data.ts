import { WalletBuilding } from "@/types/wallet";

const CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function randomAddress(): string {
  let addr = "";
  for (let i = 0; i < 44; i++) {
    addr += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return addr;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

export function generateMockWallets(count: number): WalletBuilding[] {
  const rand = seededRandom(42);
  const wallets: WalletBuilding[] = [];

  for (let i = 0; i < count; i++) {
    // Realistic power-law: most wallets are small, few are whales
    // ~50% casual (10–100), ~25% regular (100–2k), ~15% active (2k–20k), ~7% heavy (20k–200k), ~3% whales (200k–1M)
    const r = rand();
    let txnCount: number;
    if (r < 0.50) {
      txnCount = Math.floor(10 + rand() * 90);                // 10–100
    } else if (r < 0.75) {
      txnCount = Math.floor(100 + rand() * 1900);             // 100–2,000
    } else if (r < 0.90) {
      txnCount = Math.floor(2000 + rand() * 18000);           // 2,000–20,000
    } else if (r < 0.97) {
      txnCount = Math.floor(20000 + rand() * 180000);         // 20,000–200,000
    } else {
      txnCount = Math.floor(200000 + rand() * 800000);        // 200,000–1,000,000
    }

    // Volume correlates loosely with txn count
    const volumeBase = txnCount * (5 + rand() * 45);
    const volumeTraded = Math.floor(volumeBase * (0.3 + rand() * 1.4));

    wallets.push({
      address: randomAddress(),
      txnCount,
      walletAgeDays: Math.floor(rand() * 1200) + 30,
      volumeTraded,
      feesPaid: Math.round(rand() * 50 * 100) / 100,
    });
  }

  return wallets;
}
