-- Gate for showing a player's card-pickup reflection answer publicly
-- ("Community Voices" on the leaderboard). Mirrors the existing
-- completed_deeds.is_hidden_from_impact_board boolean-gate pattern — nothing
-- a player typed goes public until an admin explicitly approves it.
ALTER TABLE player_prompt_responses
  ADD COLUMN IF NOT EXISTS is_approved_for_display BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_player_prompt_responses_approved
  ON player_prompt_responses(is_approved_for_display);
