-- Cron jobs (requires pg_cron extension enabled via Supabase dashboard)

-- Snapshot city stats every 4 hours
SELECT cron.schedule(
  'capture-city-snapshot',
  '0 */4 * * *',
  'SELECT public.capture_city_snapshot()'
);
