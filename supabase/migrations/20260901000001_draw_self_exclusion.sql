-- Lets a player be permanently excluded from winning the weekly draw —
-- used for Curt's own account, so the game owner isn't eligible to win
-- their own prize giveaway. Checked in isEligible() (_shared/draw_logic.ts)
-- alongside is_active, so an excluded player's ballots simply never enter
-- the weighted pool (rather than winning and being discarded after the
-- fact, which would skew everyone else's odds).
alter table users add column if not exists excluded_from_draw boolean not null default false;

update users set excluded_from_draw = true where email = 'curt.skene@curtskene.com';
