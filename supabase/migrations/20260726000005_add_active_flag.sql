-- Adds an is_active flag to the player record. Defaults to TRUE, so every
-- existing player is active and new signups are active by default too.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
