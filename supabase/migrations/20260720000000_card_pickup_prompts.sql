-- Card-pickup reflection prompts: a short, optional self-reflection question
-- shown to the player at the "Regular vs Blackout" mode-picker step before a
-- new card is generated. Admin-editable pool, same shape as good_deeds.status
-- and bet_ya_outcomes.is_active — nothing hardcoded.

CREATE TABLE IF NOT EXISTS card_pickup_prompts (
  id SERIAL PRIMARY KEY,
  question_text TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Review','Approved','Retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per player response. response_text NULL means the player skipped —
-- in practice the frontend never calls the response endpoint on skip, so no
-- skip rows are expected, but the column stays nullable for that case anyway.
CREATE TABLE IF NOT EXISTS player_prompt_responses (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  prompt_id INTEGER NOT NULL REFERENCES card_pickup_prompts(id) ON DELETE CASCADE,
  response_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_prompt_responses_user_id ON player_prompt_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_player_prompt_responses_prompt_id ON player_prompt_responses(prompt_id);

INSERT INTO card_pickup_prompts (question_text, is_active, status) VALUES
  ('What deed are you most proud of?', true, 'Approved'),
  ('How do you feel about the game?', true, 'Approved'),
  ('What is your mission for this week?', true, 'Approved');
