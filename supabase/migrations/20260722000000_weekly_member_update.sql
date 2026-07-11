-- Weekly Member Update: a Claude-written note sent to a rotating slice of
-- active players, least-recently-contacted first (weekly_update_percentage
-- in game_configs controls what % of active members get emailed each run).

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_users_last_sent_at ON users(last_sent_at);

CREATE TABLE IF NOT EXISTS weekly_update_log (
  id SERIAL PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES users(id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  week_of DATE NOT NULL,
  message_snapshot TEXT -- the actual generated template, for audit/debugging
);
CREATE INDEX IF NOT EXISTS idx_weekly_update_log_player ON weekly_update_log(player_id, sent_at DESC);
