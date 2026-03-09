/**
 * Creates the Helius swap webhook and seeds it with all existing wallet addresses.
 *
 * Usage:
 *   source .env.local && npx tsx scripts/setup-webhook.ts https://your-domain.com
 *
 * Outputs the env vars to add to .env.local.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY!;

const appUrl = process.argv[2];
if (!appUrl) {
  console.error("Usage: npx tsx scripts/setup-webhook.ts <app-url>");
  console.error("Example: npx tsx scripts/setup-webhook.ts https://heliopolis.example.com");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  // Get all wallet addresses
  const { data: wallets, error } = await supabase
    .from("wallets")
    .select("address")
    .limit(100000);

  if (error) { console.error(error); process.exit(1); }

  const addresses = wallets.map((w: { address: string }) => w.address);
  console.log(`Found ${addresses.length} wallets to track`);

  // Generate secret
  const secret = crypto.randomUUID();
  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/webhooks/helius`;

  console.log(`Creating webhook → ${webhookUrl}`);

  const res = await fetch(
    `https://api.helius.xyz/v0/webhooks?api-key=${HELIUS_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        webhookURL: webhookUrl,
        transactionTypes: ["SWAP"],
        accountAddresses: addresses,
        webhookType: "enhanced",
        authHeader: `Bearer ${secret}`,
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    console.error(`Failed to create webhook: ${res.status} ${body}`);
    process.exit(1);
  }

  const data = await res.json();
  const webhookId = data.webhookID;

  console.log("\nWebhook created successfully!\n");
  console.log("Add these to your .env.local:\n");
  console.log(`HELIUS_WEBHOOK_ID=${webhookId}`);
  console.log(`HELIUS_WEBHOOK_SECRET=${secret}`);
  console.log(`NEXT_PUBLIC_MOCK_SWAPS=false`);
}

main();
