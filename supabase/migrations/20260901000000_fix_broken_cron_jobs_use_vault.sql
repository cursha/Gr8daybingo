-- Fix: all 4 scheduled jobs (founder notes, weekly prize draw reset, weekly
-- member update, daily inactive-player flag) have been silently failing
-- since they were created. Each one read two database settings that were
-- never configured (app.supabase_functions_url, app.cron_secret) — and on
-- Supabase's hosted database, the command that would set them
-- (ALTER DATABASE ... SET) is blocked for safety, even for the project
-- owner. So the job fires on schedule, immediately errors reading the
-- unset setting, and never even attempts to call the function.
--
-- Confirmed for founder notes: 18 queued notes since mid-July, 0 ever
-- marked sent or failed — consistent with the job never actually running.
--
-- Fix: stop depending on those settings. Use the public, non-secret
-- functions URL directly (safe to commit — it's already public in the
-- shipped frontend bundle), and read the bearer secret from Supabase
-- Vault instead of a database setting.
--
-- REQUIRES a one-time manual step BEFORE this migration is applied —
-- run once in the SQL Editor (not committed here, it's a secret):
--   select vault.create_secret('<the CRON_SECRET value>', 'cron_secret');

select cron.unschedule(jobname)
from cron.job
where jobname in (
  'send-founder-notes-hourly',
  'weekly-reset-monday',
  'weekly-member-update-wednesday',
  'flag-inactive-players-daily'
);

select cron.schedule(
  'send-founder-notes-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://cjvnxvzuummcgzmjkffk.supabase.co/functions/v1/send-founder-notes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  )
  $$
);

select cron.schedule(
  'weekly-reset-monday',
  '0 8 * * 1',
  $$
  select net.http_post(
    url := 'https://cjvnxvzuummcgzmjkffk.supabase.co/functions/v1/weekly-reset',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  )
  $$
);

select cron.schedule(
  'weekly-member-update-wednesday',
  '0 15 * * 3',
  $$
  select net.http_post(
    url := 'https://cjvnxvzuummcgzmjkffk.supabase.co/functions/v1/weekly-member-update',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  )
  $$
);

select cron.schedule(
  'flag-inactive-players-daily',
  '0 4 * * *',
  $$
  select net.http_post(
    url := 'https://cjvnxvzuummcgzmjkffk.supabase.co/functions/v1/flag-inactive-players',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  )
  $$
);
