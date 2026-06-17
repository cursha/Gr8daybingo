INSERT INTO game_configs (config_key, config_value, description, created_at)
VALUES (
  'country_promotion_threshold',
  '100',
  'Minimum number of players from a country before it gets its own leaderboard section (instead of Rest of World)',
  NOW()
) ON CONFLICT (config_key) DO NOTHING;
