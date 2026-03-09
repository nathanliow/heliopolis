-- Scale ingestion pipeline: raise retry limits, increase stale timeout
-- Key changes:
--   claim_next_ingestion_job(): stale timeout 5 → 10 min, retries 3 → 5

-- ============================================================
-- claim_next_ingestion_job: match stale timeout & retry limit
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
       OR (iq.status = 'processing' AND iq.updated_at < NOW() - INTERVAL '10 minutes'))
      AND iq.retry_count < 5
    ORDER BY iq.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING ingestion_queue.address, ingestion_queue.slices,
            ingestion_queue.pagination_token,
            ingestion_queue.pages_fetched, ingestion_queue.txns_fetched,
            ingestion_queue.retry_count, ingestion_queue.claim_nonce;
$function$;
