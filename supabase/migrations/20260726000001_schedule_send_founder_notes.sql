-- Schedule send-founder-notes every hour, on the hour. Picks up any
-- founder_note_queue row whose randomized 12-24h scheduled_send_at has
-- arrived since the last run — see 20260726000000_founder_notes.sql.
SELECT cron.schedule(
  'send-founder-notes-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_functions_url') || '/send-founder-notes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.cron_secret')
    ),
    body := '{}'::jsonb
  )
  $$
);
