-- Pick Three power-up: a player may swap exactly three squares for new deeds,
-- once per game. Track usage per card.
ALTER TABLE player_cards ADD COLUMN IF NOT EXISTS pick_three_used BOOLEAN NOT NULL DEFAULT false;
