ALTER TABLE users ADD COLUMN IF NOT EXISTS captain_team_id TEXT REFERENCES teams(id) ON DELETE SET NULL;

-- Backfill from existing teams data
UPDATE users u
SET captain_team_id = t.id
FROM teams t
WHERE t.captain_user_id = u.id;
