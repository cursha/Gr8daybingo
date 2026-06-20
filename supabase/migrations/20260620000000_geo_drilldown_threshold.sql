-- Leaderboard geo drill-down threshold
-- A province only reveals its city-level breakdown once it has at least this many
-- players. Keeps small areas from exposing individuals and keeps the drill-down
-- meaningful. Admin-configurable via game_configs.
INSERT INTO game_configs (config_key, config_value, description)
VALUES ('geo_drilldown_threshold', '5', 'Min players in a province before the leaderboard drills down to cities')
ON CONFLICT (config_key) DO NOTHING;
