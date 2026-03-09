const HELIUS_API_KEY = process.env.HELIUS_API_KEY!;
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

const BOT_DETECTION_TXS_PER_MINUTE = 20;
const MIN_TXS_FOR_BOT_CHECK = 100;

interface HeliusSignatureEntry {
  signature: string;
  blockTime: number | null;
}

async function fetchTransactionsFromHelius(
  address: string,
  limit: number,
  sortOrder: "asc" | "desc",
): Promise<HeliusSignatureEntry[]> {
  const res = await fetch(HELIUS_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransactionsForAddress",
      params: [
        address,
        {
          sortOrder,
          limit,
          transactionDetails: "full",
          encoding: "json",
          maxSupportedTransactionVersion: 0,
          filters: {
            status: "succeeded",
            tokenAccounts: "balanceChanged",
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Helius RPC error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(`Helius RPC error: ${json.error.message}`);
  }

  return json.result?.data ?? [];
}

interface DensityResult {
  isBot: boolean;
  txsPerMinute: number;
  label: string;
}

function checkBotDensity(
  transactions: HeliusSignatureEntry[],
  label: string,
): DensityResult {
  // Filter out transactions with no blockTime
  const valid = transactions.filter((tx) => tx.blockTime != null && tx.blockTime > 0);
  if (valid.length < 2) {
    return { isBot: false, txsPerMinute: 0, label };
  }

  // Sort by blockTime ascending
  valid.sort((a, b) => a.blockTime! - b.blockTime!);

  const oldest = valid[0].blockTime!;
  const newest = valid[valid.length - 1].blockTime!;
  const timeSpanMinutes = (newest - oldest) / 60;

  // All txns in the same block/second — treat as bot
  if (timeSpanMinutes === 0) {
    return { isBot: true, txsPerMinute: Infinity, label };
  }

  const txsPerMinute = valid.length / timeSpanMinutes;
  return {
    isBot: txsPerMinute >= BOT_DETECTION_TXS_PER_MINUTE,
    txsPerMinute,
    label,
  };
}

export interface BotDetectionResult {
  isBot: boolean;
  reason?: string;
}

export async function detectBotActivity(
  address: string,
): Promise<BotDetectionResult> {
  // Fetch oldest 100 transactions first
  const oldest = await fetchTransactionsFromHelius(address, MIN_TXS_FOR_BOT_CHECK, "asc");

  // If fewer than 100 total transactions, skip bot check
  if (oldest.length < MIN_TXS_FOR_BOT_CHECK) {
    return { isBot: false };
  }

  const oldestCheck = checkBotDensity(oldest, "oldest");
  if (oldestCheck.isBot) {
    return {
      isBot: true,
      reason: `High tx density in oldest transactions: ${oldestCheck.txsPerMinute.toFixed(1)} txns/min`,
    };
  }

  // Fetch newest 100 transactions
  const newest = await fetchTransactionsFromHelius(address, MIN_TXS_FOR_BOT_CHECK, "desc");

  const newestCheck = checkBotDensity(newest, "newest");
  if (newestCheck.isBot) {
    return {
      isBot: true,
      reason: `High tx density in newest transactions: ${newestCheck.txsPerMinute.toFixed(1)} txns/min`,
    };
  }

  return { isBot: false };
}
