-- Daily Streak Tracker
-- Adds streak tracking fields to users, a configurable milestones table,
-- and a per-player milestone achievements table.

-- Streak fields on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS current_streak_days  INTEGER  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak_days  INTEGER  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_valid_deed_date DATE;

-- Configurable streak milestones
CREATE TABLE IF NOT EXISTS streak_milestones (
  id            SERIAL       PRIMARY KEY,
  days_required INTEGER      NOT NULL UNIQUE,
  label         TEXT         NOT NULL,
  message       TEXT         NOT NULL,
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  display_order INTEGER      NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Per-player milestone achievements (UNIQUE prevents duplicate awards)
CREATE TABLE IF NOT EXISTS player_streak_achievements (
  id           SERIAL       PRIMARY KEY,
  user_id      TEXT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone_id INTEGER      NOT NULL REFERENCES streak_milestones(id) ON DELETE CASCADE,
  achieved_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, milestone_id)
);

CREATE INDEX IF NOT EXISTS idx_psa_user_id ON player_streak_achievements(user_id);

-- Default milestones
INSERT INTO streak_milestones (days_required, label, message, display_order) VALUES
  (7,   '7-Day Streak',   'One week of daily kindness — you are building something beautiful!', 10),
  (14,  '14-Day Streak',  'Two weeks strong! Your commitment to doing good is inspiring.', 20),
  (30,  '30-Day Streak',  'A full month of Gr8Day Deeds! You are making the world a better place.', 30),
  (60,  '60-Day Streak',  'Two months of consecutive kindness — you are a true Gr8Day Champion!', 40),
  (100, '100-Day Streak', '100 days of good deeds. That is extraordinary dedication. Keep going!', 50),
  (365, '365-Day Streak', 'One full year of daily kindness. You are a legend. The world is better because of you.', 60)
ON CONFLICT (days_required) DO NOTHING;

-- Admin config: streak enabled toggle
INSERT INTO game_configs (config_key, config_value, description)
VALUES ('streak_enabled', 'true', 'Enable the daily streak tracker (true/false)')
ON CONFLICT (config_key) DO NOTHING;
