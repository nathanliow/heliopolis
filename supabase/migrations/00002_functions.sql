-- Heliopolis functions & triggers

-- ============================================================
-- enqueue_wallet: atomically insert wallet + ingestion job
-- ============================================================

CREATE OR REPLACE FUNCTION public.enqueue_wallet(
  p_address text,
  p_wallet_age_days integer,
  p_first_tx_at timestamptz
) RETURNS void
LANGUAGE plpgsql AS $function$
DECLARE
  v_slices JSONB;
BEGIN
  INSERT INTO wallets (address, txn_count, volume_traded_sol, fees_paid_sol,
                       wallet_age_days, first_tx_at, ingestion_status, updated_at)
  VALUES (p_address, 0, 0, 0, p_wallet_age_days, p_first_tx_at, 'queued', NOW())
  ON CONFLICT (address) DO NOTHING;

  v_slices := jsonb_build_array(
    jsonb_build_object(
      'gte', 0,
      'lte', 9999999999,
      'cursor', NULL,
      'pages_fetched', 0,
      'txns_fetched', 0,
      'done', false
    )
  );

  INSERT INTO ingestion_queue (address, status, slices, created_at, updated_at)
  VALUES (p_address, 'pending', v_slices, NOW(), NOW())
  ON CONFLICT (address) DO NOTHING;
END;
$function$;

-- ============================================================
-- claim_next_ingestion_job: atomic queue claim with stale retry
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_next_ingestion_job()
RETURNS TABLE(
  address text,
  slices jsonb,
  pagination_token text,
  pages_fetched integer,
  txns_fetched integer,
  retry_count integer,
  claim_nonce uuid
)
LANGUAGE sql AS $function$
  UPDATE ingestion_queue
  SET status = 'processing',
      updated_at = NOW(),
      claim_nonce = gen_random_uuid(),
      retry_count = CASE
        WHEN ingestion_queue.status = 'processing' THEN ingestion_queue.retry_count + 1
        ELSE ingestion_queue.retry_count
      END
  WHERE ingestion_queue.address = (
    SELECT iq.address FROM ingestion_queue iq
    WHERE (iq.status = 'pending'
       OR (iq.status = 'processing' AND iq.updated_at < NOW() - INTERVAL '5 minutes'))
      AND iq.retry_count < 3
    ORDER BY iq.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING ingestion_queue.address, ingestion_queue.slices,
            ingestion_queue.pagination_token,
            ingestion_queue.pages_fetched, ingestion_queue.txns_fetched,
            ingestion_queue.retry_count, ingestion_queue.claim_nonce;
$function$;

-- ============================================================
-- heartbeat_ingestion_job: keep-alive for long-running jobs
-- ============================================================

CREATE OR REPLACE FUNCTION public.heartbeat_ingestion_job(
  p_address text,
  p_claim_nonce uuid
) RETURNS boolean
LANGUAGE sql AS $function$
  UPDATE ingestion_queue
  SET updated_at = NOW()
  WHERE address = p_address
    AND claim_nonce = p_claim_nonce
    AND status = 'processing'
  RETURNING TRUE;
$function$;

-- ============================================================
-- complete_ingestion_batch: finalize a batch of ingested txns
-- ============================================================

CREATE OR REPLACE FUNCTION public.complete_ingestion_batch(
  p_address text,
  p_claim_nonce uuid,
  p_slices jsonb,
  p_pages_fetched integer,
  p_txns_fetched integer,
  p_is_complete boolean,
  p_txn_count integer,
  p_volume_lamports text,
  p_fees_lamports text,
  p_earliest_blocktime bigint,
  p_unique_tokens integer DEFAULT 0,
  p_latest_blocktime bigint DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
  UPDATE ingestion_queue
  SET status = CASE WHEN p_is_complete THEN 'complete' ELSE 'processing' END,
      slices = p_slices,
      pages_fetched = p_pages_fetched,
      txns_fetched = p_txns_fetched,
      updated_at = NOW()
  WHERE address = p_address AND claim_nonce = p_claim_nonce;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  UPDATE wallets SET
    txn_count = txn_count + p_txn_count,
    volume_traded_sol = volume_traded_sol + (p_volume_lamports::DOUBLE PRECISION / 1e9),
    fees_paid_sol = fees_paid_sol + (p_fees_lamports::DOUBLE PRECISION / 1e9),
    first_tx_at = CASE
      WHEN first_tx_at IS NULL AND p_earliest_blocktime IS NOT NULL
      THEN to_timestamp(p_earliest_blocktime) ELSE first_tx_at
    END,
    wallet_age_days = CASE
      WHEN p_is_complete THEN EXTRACT(DAY FROM NOW() - COALESCE(
        first_tx_at,
        CASE WHEN p_earliest_blocktime IS NOT NULL THEN to_timestamp(p_earliest_blocktime) END
      ))::INT ELSE wallet_age_days
    END,
    unique_tokens_swapped = unique_tokens_swapped + COALESCE(p_unique_tokens, 0),
    latest_tx_at = GREATEST(latest_tx_at, CASE WHEN p_latest_blocktime IS NOT NULL THEN to_timestamp(p_latest_blocktime) END),
    ingestion_status = CASE WHEN p_is_complete THEN 'complete' ELSE 'processing' END,
    updated_at = NOW()
  WHERE address = p_address;

  RETURN TRUE;
END;
$function$;

-- ============================================================
-- assign_city_position: place a wallet in the city grid
-- ============================================================

CREATE OR REPLACE FUNCTION public.assign_city_position(p_address text)
RETURNS TABLE(assigned_row smallint, assigned_col smallint, assigned_slot smallint)
LANGUAGE plpgsql AS $function$
DECLARE
  v_pool_size    INT;
  v_occupied     INT;
  v_pick_index   INT;
  v_block_row    SMALLINT;
  v_block_col    SMALLINT;
  v_slot         SMALLINT;
  v_attempt      INT := 0;
  v_max_attempts INT := 5;
BEGIN
  -- Lock the wallet row
  PERFORM 1 FROM wallets
    WHERE address = p_address
      AND ingestion_status = 'complete'
      AND block_row IS NULL
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Count occupied blocks
  SELECT COUNT(DISTINCT (w.block_row, w.block_col))::INT
    INTO v_occupied
    FROM wallets w
   WHERE w.block_row IS NOT NULL;

  -- Adaptive pool size
  v_pool_size := GREATEST(5, CEIL(v_occupied * 0.4) + 3);

  LOOP
    v_attempt := v_attempt + 1;

    -- Pick random index in pool, biased toward center
    v_pick_index := FLOOR(POW(random(), 1.5) * v_pool_size)::INT;

    -- Select the block at that pool index
    SELECT br, bc INTO v_block_row, v_block_col
    FROM (
      SELECT bso.block_row AS br,
             bso.block_col AS bc,
             ROW_NUMBER() OVER (ORDER BY bso.spiral_index) - 1 AS pool_idx
        FROM block_spiral_order bso
        LEFT JOIN wallets w
          ON w.block_row = bso.block_row AND w.block_col = bso.block_col
       WHERE bso.is_park = FALSE
       GROUP BY bso.spiral_index, bso.block_row, bso.block_col
      HAVING COUNT(w.address) < 16
       ORDER BY bso.spiral_index
       LIMIT v_pool_size
    ) pool
    WHERE pool.pool_idx = v_pick_index;

    -- Fallback if pick overshoots
    IF v_block_row IS NULL THEN
      SELECT bso.block_row, bso.block_col
        INTO v_block_row, v_block_col
        FROM block_spiral_order bso
        LEFT JOIN wallets w
          ON w.block_row = bso.block_row AND w.block_col = bso.block_col
       WHERE bso.is_park = FALSE
       GROUP BY bso.spiral_index, bso.block_row, bso.block_col
      HAVING COUNT(w.address) < 16
       ORDER BY bso.spiral_index
       LIMIT 1;
    END IF;

    -- City is full
    IF v_block_row IS NULL THEN
      RETURN;
    END IF;

    -- Pick random available slot (0-15)
    SELECT s.slot::SMALLINT INTO v_slot
      FROM generate_series(0, 15) AS s(slot)
     WHERE NOT EXISTS (
       SELECT 1 FROM wallets w
        WHERE w.block_row = v_block_row
          AND w.block_col = v_block_col
          AND w.local_slot = s.slot
     )
     ORDER BY random()
     LIMIT 1;

    -- Block filled between queries
    IF v_slot IS NULL THEN
      IF v_attempt >= v_max_attempts THEN RETURN; END IF;
      CONTINUE;
    END IF;

    -- Attempt assignment
    BEGIN
      UPDATE wallets
         SET block_row  = v_block_row,
             block_col  = v_block_col,
             local_slot = v_slot,
             updated_at = NOW()
       WHERE address = p_address
         AND block_row IS NULL;

      IF NOT FOUND THEN RETURN; END IF;

      assigned_row  := v_block_row;
      assigned_col  := v_block_col;
      assigned_slot := v_slot;
      RETURN NEXT;
      RETURN;

    EXCEPTION
      WHEN unique_violation THEN
        IF v_attempt >= v_max_attempts THEN RETURN; END IF;
    END;
  END LOOP;
END;
$function$;

-- ============================================================
-- repair_unplaced_wallets: batch-place completed but unplaced wallets
-- ============================================================

CREATE OR REPLACE FUNCTION public.repair_unplaced_wallets()
RETURNS integer
LANGUAGE plpgsql AS $function$
DECLARE
  v_address TEXT;
  v_count INTEGER := 0;
BEGIN
  FOR v_address IN
    SELECT address FROM wallets
    WHERE ingestion_status = 'complete'
      AND block_row IS NULL
    LIMIT 100
  LOOP
    PERFORM assign_city_position(v_address);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- ============================================================
-- capture_city_snapshot: periodic aggregate stats (3-hour dedup)
-- ============================================================

CREATE OR REPLACE FUNCTION public.capture_city_snapshot()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM city_snapshots
    WHERE created_at > now() - interval '3 hours'
  ) THEN
    RETURN;
  END IF;

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
    AND ingestion_status = 'complete';
END;
$function$;

-- ============================================================
-- maybe_cleanup_swap_events: probabilistic old event cleanup
-- ============================================================

CREATE OR REPLACE FUNCTION public.maybe_cleanup_swap_events()
RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
  IF random() < 0.05 THEN
    DELETE FROM swap_events WHERE created_at < NOW() - INTERVAL '1 hour';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_cleanup_swaps
  AFTER INSERT ON public.swap_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION maybe_cleanup_swap_events();

