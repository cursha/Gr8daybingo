-- Config: dollar amount credited to a referrer's wallet when a friend they
-- invited via "Invite a Friend" verifies their email (see auth-custom
-- /verify-email referral validation). Admin-editable, mirrors the existing
-- signup_bonus_amount pattern.
INSERT INTO game_configs (config_key, config_value, description, updated_at)
VALUES ('referral_bonus_amount', '5', 'Dollar amount credited to a player''s wallet when a friend they referred verifies their email', NOW())
ON CONFLICT (config_key) DO NOTHING;
