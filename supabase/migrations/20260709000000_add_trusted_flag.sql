ALTER TABLE users ADD COLUMN IF NOT EXISTS is_trusted BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: every player who already exists at the time this migration runs
-- becomes trusted (grandfathered in). The daily cap only applies to players
-- who sign up AFTER this point — the DEFAULT FALSE above handles that.
UPDATE users SET is_trusted = TRUE;
