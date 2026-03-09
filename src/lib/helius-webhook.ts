const HELIUS_WEBHOOKS_API = "https://api.helius.xyz/v0/webhooks";

function apiKey(): string {
  return process.env.HELIUS_API_KEY!;
}

function webhookId(): string | undefined {
  return process.env.HELIUS_WEBHOOK_ID || undefined;
}

function webhookSecret(): string | undefined {
  return process.env.HELIUS_WEBHOOK_SECRET || undefined;
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

/**
 * Add a single address to the existing swap webhook.
 * Fetches the current webhook config, appends the address (if not already present),
 * and PUTs the full object back (Helius requires the full object on update).
 *
 * No-ops silently if HELIUS_WEBHOOK_ID is not configured.
 */
export async function addAddressToWebhook(address: string): Promise<void> {
  const id = webhookId();
  if (!id) return;

  try {
    // GET current webhook
    const getRes = await fetch(
      `${HELIUS_WEBHOOKS_API}/${id}?api-key=${apiKey()}`,
    );
    if (!getRes.ok) {
      console.error(`Failed to get webhook: ${getRes.status}`);
      return;
    }
    const webhook = await getRes.json();

    // Skip if already tracked
    const existing: string[] = webhook.accountAddresses ?? [];
    if (existing.includes(address)) return;

    // PUT with new address appended
    existing.push(address);
    const putRes = await fetch(
      `${HELIUS_WEBHOOKS_API}/${id}?api-key=${apiKey()}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...webhook,
          accountAddresses: existing,
        }),
      },
    );

    if (!putRes.ok) {
      const body = await putRes.text();
      console.error(`Failed to update webhook: ${putRes.status} ${body}`);
    }
  } catch (err) {
    console.error("addAddressToWebhook error:", err);
  }
}
