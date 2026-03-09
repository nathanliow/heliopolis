const HELIUS_WEBHOOKS_API = "https://api.helius.xyz/v0/webhooks";

function apiKey(): string {
  return process.env.HELIUS_API_KEY!;
}

/** Create the swap webhook. Returns { webhookId, secret }. */
export async function createSwapWebhook(
  webhookUrl: string,
  addresses: string[],
): Promise<{ webhookId: string; secret: string }> {
  const secret = crypto.randomUUID();

  const res = await fetch(`${HELIUS_WEBHOOKS_API}?api-key=${apiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      webhookURL: webhookUrl,
      transactionTypes: ["SWAP"],
      accountAddresses: addresses,
      webhookType: "enhanced",
      authHeader: `Bearer ${secret}`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create webhook: ${res.status} ${body}`);
  }

  const data = await res.json();
  return { webhookId: data.webhookID, secret };
}

