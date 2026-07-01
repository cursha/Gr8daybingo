-- Eligibility: which deeds CAN appear in a player's Quick Tap picker
ALTER TABLE good_deeds ADD COLUMN IF NOT EXISTS quick_tap_eligible BOOLEAN NOT NULL DEFAULT FALSE;

-- Default: which eligible deeds are the fallback when a player hasn't customized
ALTER TABLE good_deeds ADD COLUMN IF NOT EXISTS quick_tap_default BOOLEAN NOT NULL DEFAULT FALSE;

-- Per-player Quick Tap selection (1-3 deeds, ordered)
CREATE TABLE IF NOT EXISTS user_quick_tap_deeds (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deed_id INTEGER NOT NULL REFERENCES good_deeds(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, deed_id)
);

CREATE INDEX IF NOT EXISTS user_quick_tap_deeds_user_idx ON user_quick_tap_deeds(user_id);
