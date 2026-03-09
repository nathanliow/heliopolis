-- Per-wallet snapshots for historical city reconstruction / timelapse

-- ============================================================
-- 1. New table: wallet_snapshots
-- ============================================================

CREATE TABLE public.wallet_snapshots (
  snapshot_id         bigint NOT NULL REFERENCES city_snapshots(id) ON DELETE CASCADE,
  wallet_address      text   NOT NULL,
  txn_count           integer NOT NULL,
  volume_traded_sol   double precision NOT NULL,
  block_row           smallint NOT NULL,
  block_col           smallint NOT NULL,
  local_slot          smallint NOT NULL,
  unique_tokens_swapped integer NOT NULL DEFAULT 0,
  latest_tx_at        timestamptz,
  PRIMARY KEY (snapshot_id, wallet_address)
);

CREATE INDEX idx_wallet_snapshots_snapshot_id
  ON public.wallet_snapshots (snapshot_id);

-- RLS: public read (matches city_snapshots policy)
ALTER TABLE public.wallet_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON public.wallet_snapshots
  FOR SELECT USING (true);

-- ============================================================
-- 2. Updated capture_city_snapshot() — now captures per-wallet data
--    Dedup reduced from 3h → 1.5h to support 2h cron interval
-- ============================================================

CREATE OR REPLACE FUNCTION public.capture_city_snapshot()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $function$
DECLARE
  v_snapshot_id bigint;
BEGIN
  -- 1.5-hour dedup (reduced from 3h to support 2h cron)
  IF EXISTS (
    SELECT 1 FROM city_snapshots
    WHERE created_at > now() - interval '1.5 hours'
  ) THEN
    RETURN;
  END IF;

  -- Insert aggregate snapshot, capture ID
  INSERT INTO city_snapshots (
    total_wallets,
    total_txn_count,
    total_volume_sol,
    total_fees_sol,
    avg_wallet_age_days,
    occupied_blocks
  )
  SELECT
    count(*)::integer,
    coalesce(sum(txn_count), 0)::bigint,
    coalesce(sum(volume_traded_sol), 0),
    coalesce(sum(fees_paid_sol), 0),
    coalesce(avg(wallet_age_days), 0),
    count(DISTINCT (block_row, block_col))::integer
  FROM wallets
  WHERE block_row IS NOT NULL
    AND ingestion_status = 'complete'
  RETURNING id INTO v_snapshot_id;

  -- Insert per-wallet snapshot
  INSERT INTO wallet_snapshots (
    snapshot_id, wallet_address, txn_count, volume_traded_sol,
    block_row, block_col, local_slot, unique_tokens_swapped, latest_tx_at
  )
  SELECT
    v_snapshot_id, address, txn_count, volume_traded_sol,
    block_row, block_col, local_slot, unique_tokens_swapped, latest_tx_at
  FROM wallets
  WHERE block_row IS NOT NULL
    AND ingestion_status = 'complete';
END;
$function$;

-- ============================================================
-- 3. Update cron schedule: 4h → 2h
-- ============================================================

DO $$
BEGIN
  PERFORM cron.unschedule('capture-city-snapshot');
EXCEPTION WHEN OTHERS THEN
  -- Job may not exist yet; ignore
END;
$$;

SELECT cron.schedule(
  'capture-city-snapshot',
  '0 */2 * * *',
  'SELECT public.capture_city_snapshot()'
);

-- ============================================================
-- 4. Backfill: attach current wallet data to existing snapshot(s)
-- ============================================================

INSERT INTO wallet_snapshots (
  snapshot_id, wallet_address, txn_count, volume_traded_sol,
  block_row, block_col, local_slot, unique_tokens_swapped, latest_tx_at
)
SELECT
  cs.id, w.address, w.txn_count, w.volume_traded_sol,
  w.block_row, w.block_col, w.local_slot, w.unique_tokens_swapped, w.latest_tx_at
FROM city_snapshots cs
CROSS JOIN wallets w
WHERE w.block_row IS NOT NULL
  AND w.ingestion_status = 'complete'
  AND NOT EXISTS (
    SELECT 1 FROM wallet_snapshots ws
    WHERE ws.snapshot_id = cs.id AND ws.wallet_address = w.address
  );
