-- Schedule flag-inactive-players daily at 4am UTC. Independent of any
-- player loading the game — see flag-inactive-players/index.ts for why this
-- sweep is needed on top of the check /generate-card already does.
SELECT cron.schedule(
  'flag-inactive-players-daily',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_functions_url') || '/flag-inactive-players',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.cron_secret')
    ),
    body := '{}'::jsonb
  )
  $$
);
