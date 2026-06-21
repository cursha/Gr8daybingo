-- Referral gating (Curt): players who were NOT referred by a current player are
-- capped at this many completed Gr8Day Deeds per rolling 24 hours. Table-driven
-- so the cap can be tuned (or set to 0 to disable the cap entirely). Referred
-- players are unlimited.
INSERT INTO game_configs (config_key, config_value, description)
VALUES ('non_referred_daily_deed_limit', '3', 'Max Gr8Day Deeds per 24h for players who were not referred (0 = no limit)')
ON CONFLICT (config_key) DO NOTHING;
