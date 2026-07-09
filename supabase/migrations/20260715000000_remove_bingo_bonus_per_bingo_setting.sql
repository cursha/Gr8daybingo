-- The bingo bonus amount is no longer a fixed admin-configured constant —
-- it's now a random 6-20 roll per completed bingo (see awardBingoBonus in
-- _shared/draw.ts). bingo_bonus_entries_per_bingo no longer controls
-- anything; bingo_bonus_enabled remains as the on/off toggle.
DELETE FROM game_configs WHERE config_key = 'bingo_bonus_entries_per_bingo';
