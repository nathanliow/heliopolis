-- Enable the HTTP extension for making API calls from PL/pgSQL
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- Sync all wallet addresses to the Helius webhook
-- Reads addresses from `wallets` table, compares with current webhook state,
-- and PUTs the full list if they differ. Single-writer pattern eliminates race conditions.
CREATE OR REPLACE FUNCTION public.sync_webhook_addresses()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $function$
DECLARE
  v_api_key    TEXT;
  v_webhook_id TEXT;
  v_base_url   TEXT;
  v_get_resp   record;
  v_webhook    jsonb;
  v_db_addrs   jsonb;
  v_wh_addrs   jsonb;
BEGIN
  -- Read secrets from vault
  v_api_key    := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'helius_api_key' LIMIT 1);
  v_webhook_id := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'helius_webhook_id' LIMIT 1);

  IF v_api_key IS NULL OR v_webhook_id IS NULL THEN RETURN; END IF;

  v_base_url := 'https://api.helius.xyz/v0/webhooks/' || v_webhook_id || '?api-key=' || v_api_key;

  -- Build sorted address array from DB
  SELECT jsonb_agg(address ORDER BY address) INTO v_db_addrs FROM wallets;
  IF v_db_addrs IS NULL THEN v_db_addrs := '[]'::jsonb; END IF;

  -- GET current webhook
  SELECT * INTO v_get_resp FROM extensions.http_get(v_base_url);
  IF v_get_resp.status != 200 THEN RETURN; END IF;

  v_webhook := v_get_resp.content::jsonb;

  -- Sort existing webhook addresses for comparison
  SELECT jsonb_agg(val ORDER BY val) INTO v_wh_addrs
  FROM jsonb_array_elements_text(COALESCE(v_webhook->'accountAddresses', '[]'::jsonb)) AS val;
  IF v_wh_addrs IS NULL THEN v_wh_addrs := '[]'::jsonb; END IF;

  -- Skip PUT if already in sync
  IF v_db_addrs = v_wh_addrs THEN RETURN; END IF;

  -- PUT updated webhook
  PERFORM extensions.http_put(
    v_base_url,
    jsonb_build_object(
      'webhookURL',       v_webhook->>'webhookURL',
      'transactionTypes', v_webhook->'transactionTypes',
      'accountAddresses', v_db_addrs,
      'webhookType',      v_webhook->>'webhookType',
      'authHeader',       v_webhook->>'authHeader'
    )::text,
    'application/json'
  );
END;
$function$;

-- Run every 30 seconds
SELECT cron.schedule(
  'sync-webhook-addresses',
  '30 seconds',
  'SELECT public.sync_webhook_addresses()'
);
