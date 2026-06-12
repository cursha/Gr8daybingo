-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule weekly-reset edge function every Monday at 8:00 AM UTC
-- The function URL will be set via the SUPABASE_URL environment variable
SELECT cron.schedule(
  'weekly-reset-monday',
  '0 8 * * 1',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_functions_url') || '/weekly-reset',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.cron_secret')
    ),
    body := '{}'::jsonb
  )
  $$
);
