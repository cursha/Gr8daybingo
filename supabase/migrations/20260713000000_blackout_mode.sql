-- Blackout Game Mode (Phase 4) — a fog-of-war layer on top of the existing
-- card, not a different win condition or card layout. Win checking is
-- unchanged (same checkBingo(), same global win_condition setting). Blackout
-- cards get NO special squares (no purchasable/hidden-bonus/referral-free) —
-- every non-center cell is a plain deed square, all hidden at generation.
-- The center "I Bet Ya" free space is completely untouched.
--
-- Reveal: player taps a hidden cell -> that cell uncovers, plus 0-3 more via
-- 8-directional flood-fill through hidden cells only (table-driven odds).
-- Each opened square is then resolved individually — completed via the
-- existing /mark-cell, or passed (permanently blocked). No timer: a player
-- can leave a square unresolved indefinitely; they just can't reveal again
-- until every square in the current open group is resolved one way or the
-- other.

-- Which mode a card was generated under. Frozen at generation time, same
-- frozen-card-contract pattern as everything else on player_cards.
ALTER TABLE player_cards ADD COLUMN IF NOT EXISTS game_mode TEXT NOT NULL DEFAULT 'classic';

-- Blackout-specific state, one row per Blackout card. Kept fully separate
-- from card_data / player_cards so classic-mode code paths are untouched.
CREATE TABLE IF NOT EXISTS blackout_state (
  card_id INTEGER PRIMARY KEY REFERENCES player_cards(id) ON DELETE CASCADE,
  hidden_cells JSONB NOT NULL DEFAULT '[]',   -- cell indices still hidden
  blocked_cells JSONB NOT NULL DEFAULT '[]',  -- cell indices passed on — permanently unusable
  active_group JSONB,                          -- cell indices in the current open group, or null
  is_paused BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin config, same game_configs pattern as win_condition. Reveal
-- probability defaults heavily skewed toward "nothing extra opens" per
-- Curt's spec (0 most common, 3 rare) — fully admin-editable afterward.
INSERT INTO game_configs (config_key, config_value, description, updated_at) VALUES
  ('blackout_enabled', 'false', 'Whether Blackout is offered as a mode choice this cycle (1=offered, 0=classic only, same as today)', NOW()),
  ('blackout_reveal_probability', '{"0":55,"1":25,"2":15,"3":5}', 'Admin weights (must sum to 100) for extra squares revealed (0-3) on top of the clicked square', NOW()),
  ('blackout_min_hidden_remaining', '3', 'Floor: a reveal is trimmed back to just the clicked square once hidden count would drop below this', NOW())
ON CONFLICT (config_key) DO NOTHING;
