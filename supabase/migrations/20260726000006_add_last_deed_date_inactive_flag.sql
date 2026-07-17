-- Makes the "flag inactive" window admin-configurable (default 30 days).
-- Reuses the existing users.last_valid_deed_date (streak tracker, kept in
-- sync on every deed completion) rather than adding a new column — see
-- sendGameLaunchEmails() for the established last_valid_deed_date ?? created_at
-- fallback pattern this reuses for players who've never played.
INSERT INTO game_configs (config_key, config_value, description)
VALUES (
  'inactive_days_threshold', '30',
  'Days since a player''s last completed deed (or signup, if they never played) before they''re auto-flagged inactive (checked when their weekly card is generated)'
)
ON CONFLICT (config_key) DO NOTHING;
