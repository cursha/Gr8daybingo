-- Move the weekly prize draw from fully-automatic (cron picks AND commits a
-- winner with no human review) to manual: an admin computes a preview
-- winner, reviews it, then explicitly confirms before anything is committed
-- or announced. See supabase/functions/game/routes/admin_draw_results.ts.

-- Stop the Monday auto-run entirely — leaving it scheduled would commit a
-- winner before an admin ever sees the new confirm screen.
select cron.unschedule(jobname)
from cron.job
where jobname = 'weekly-reset-monday';

-- Replace it with a reminder-only Monday job: same time, same Vault-secret
-- auth pattern as the other scheduled jobs, but it only emails the admin —
-- no draw logic runs here. See supabase/functions/send-draw-reminder/.
select cron.schedule(
  'draw-reminder-monday',
  '0 8 * * 1',
  $$
  select net.http_post(
    url := 'https://cjvnxvzuummcgzmjkffk.supabase.co/functions/v1/send-draw-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  )
  $$
);

-- One row per week: a winner has been computed and is awaiting confirmation.
-- Deleted once confirmed (the permanent record then lives in draw_winners).
CREATE TABLE IF NOT EXISTS draw_pending (
  week_year TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  winner_display_name TEXT,
  winning_entries INT NOT NULL,
  pool_entries INT NOT NULL,
  eligible_players INT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE draw_pending ENABLE ROW LEVEL SECURITY;
