-- Schedule weekly-member-update edge function every Wednesday at 3:00 PM UTC
-- (mid-week, deliberately offset from the Monday 8am weekly-reset send so
-- the two emails don't land in the same inbox moment).
SELECT cron.schedule(
  'weekly-member-update-wednesday',
  '0 15 * * 3',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_functions_url') || '/weekly-member-update',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.cron_secret')
    ),
    body := '{}'::jsonb
  )
  $$
);
