CREATE SEQUENCE IF NOT EXISTS team_number_seq START 1001 INCREMENT 1;

CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  team_number INTEGER UNIQUE NOT NULL DEFAULT nextval('team_number_seq'),
  team_name TEXT NOT NULL,
  captain_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id)  -- one team per player
);

CREATE INDEX IF NOT EXISTS team_members_team_id ON team_members (team_id);
CREATE INDEX IF NOT EXISTS team_members_user_id ON team_members (user_id);
