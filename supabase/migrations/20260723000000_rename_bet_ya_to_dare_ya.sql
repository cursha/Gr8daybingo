-- Renaming the centre-square weighted-odds feature from "Bet Ya" back to its
-- original "I Dare Ya" branding (Curt's call — supersedes the 2026-07-05 fix
-- that went the other direction). Table rename is metadata-only in Postgres,
-- no data rewrite; existing rows and their odds_percent/action_type values
-- are untouched.
ALTER TABLE bet_ya_outcomes RENAME TO dare_ya_outcomes;
ALTER TABLE dare_ya_outcomes RENAME CONSTRAINT bet_ya_outcomes_pkey TO dare_ya_outcomes_pkey;
ALTER TABLE dare_ya_outcomes RENAME CONSTRAINT bet_ya_outcomes_action_type_check TO dare_ya_outcomes_action_type_check;
ALTER SEQUENCE bet_ya_outcomes_id_seq RENAME TO dare_ya_outcomes_id_seq;
ALTER TABLE referrals RENAME COLUMN bet_ya_credited_at TO dare_ya_credited_at;
