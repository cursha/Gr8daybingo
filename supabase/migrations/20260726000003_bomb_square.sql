-- Config: odds that a classic-mode card gets a Bomb Square — a hidden square
-- that, when tapped, instantly rewrites the whole card instead of completing
-- like a normal deed (see /mark-cell, regenerateClassicCard in game/index.ts).
-- Per the existing "Fun Features" welcome email: "Approximately one in every
-- hundred cards contains a Bomb Square." Admin-editable, mirrors the existing
-- dollar1_pct / secret_reward_1_pct percentage-config pattern.
INSERT INTO game_configs (config_key, config_value, description, updated_at)
VALUES ('bomb_square_probability_pct', '1', 'Percent chance (0-100) a classic-mode card gets a hidden Bomb Square that rewrites the whole card when tapped', NOW())
ON CONFLICT (config_key) DO NOTHING;
