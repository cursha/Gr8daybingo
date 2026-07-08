-- Players flagged is_test can keep playing while Offline Mode is on, so Curt
-- can pause the app for the general public while still asking specific
-- people to help him test. Off by default for every player.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
