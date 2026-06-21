-- ============================================================
-- Player Progression Levels (Issue #15)
-- Players unlock harder cards as they earn bingos. Difficulty already exists:
--   good_deeds.complexity (1-5)  = deed difficulty
--   users.challenge_level (1-5)  = the level the player chooses to play
-- This migration adds the configurable unlock thresholds and records which
-- level each card was generated at.
-- ============================================================

-- Configurable thresholds: how many bingos unlock each level. Admin-editable.
CREATE TABLE IF NOT EXISTS player_levels (
  id SERIAL PRIMARY KEY,
  level_number INTEGER UNIQUE NOT NULL,
  level_name TEXT NOT NULL,
  required_bingos INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with Curt's example thresholds (editable in admin).
INSERT INTO player_levels (level_number, level_name, required_bingos) VALUES
  (1, 'Level 1', 0),
  (2, 'Level 2', 1),
  (3, 'Level 3', 5),
  (4, 'Level 4', 15),
  (5, 'Level 5', 30)
ON CONFLICT (level_number) DO NOTHING;

-- Lock in the level a card was generated at, so changing the player's selected
-- level never alters existing cards.
ALTER TABLE player_cards ADD COLUMN IF NOT EXISTS card_level INTEGER;
