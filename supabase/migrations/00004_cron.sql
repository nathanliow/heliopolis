-- Cron jobs (requires pg_cron extension enabled via Supabase dashboard)

-- Snapshot city stats every 4 hours
SELECT cron.schedule(
  'capture-city-snapshot',
  '0 */4 * * *',
  'SELECT public.capture_city_snapshot()'
);

-- Dispatch ingestion workers every 15 seconds
SELECT cron.schedule(
  'dispatch-wallet-queue',
  '15 seconds',
  'SELECT dispatch_wallet_queue();'
);
