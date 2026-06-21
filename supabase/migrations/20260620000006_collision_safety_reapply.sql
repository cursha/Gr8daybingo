-- Collision safety re-apply.
-- Two parallel sessions both used version 20260620000003 (anonymous_play vs
-- non_referred_deed_limit). Whichever applied first won that version slot, so
-- the other one's SQL was skipped on prod. Both migrations are fully idempotent,
-- so we re-apply both here under a fresh version to GUARANTEE their effects are
-- present on production no matter which one originally ran. This is a no-op if
-- they already ran.

-- (from 20260620000003_anonymous_play.sql) Anonymous Play (Issue #17)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS registration_type TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_registration_type_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_registration_type_check
      CHECK (registration_type IN ('standard', 'anonymous'));
  END IF;
END $$;

-- (from 20260620000005_non_referred_deed_limit.sql) referral gating config
INSERT INTO game_configs (config_key, config_value, description)
VALUES ('non_referred_daily_deed_limit', '3', 'Max Gr8Day Deeds per 24h for players who were not referred (0 = no limit)')
ON CONFLICT (config_key) DO NOTHING;
