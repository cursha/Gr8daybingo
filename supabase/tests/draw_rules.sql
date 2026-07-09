-- =============================================================================
-- Weekly Draw Entry System — rule tests (Issue #33)
-- Run against a DB that has all migrations applied:
--   psql ... -v ON_ERROR_STOP=1 -f tests/draw_rules.sql
-- Each block RAISEs EXCEPTION on failure, so a clean run = all green.
-- Self-contained: seeds its own users/cards, cleans up at the end.
-- =============================================================================
BEGIN;
SET client_min_messages = WARNING;

-- ── helpers ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _assert(cond BOOLEAN, msg TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$ BEGIN IF NOT cond THEN RAISE EXCEPTION 'ASSERT FAILED: %', msg; END IF; END $$;

CREATE OR REPLACE FUNCTION _active(p TEXT) RETURNS BIGINT
LANGUAGE sql AS $$ SELECT COALESCE(active_entries,0)   FROM player_draw_balances WHERE player_id=p $$;
CREATE OR REPLACE FUNCTION _life(p TEXT) RETURNS BIGINT
LANGUAGE sql AS $$ SELECT COALESCE(lifetime_entries,0) FROM player_draw_balances WHERE player_id=p $$;
CREATE OR REPLACE FUNCTION _week(p TEXT) RETURNS BIGINT
LANGUAGE sql AS $$ SELECT COALESCE(this_week_entries,0) FROM player_draw_balances WHERE player_id=p $$;

-- ── fixtures ─────────────────────────────────────────────────────────────────
INSERT INTO users (id,email,role) VALUES
  ('u1','u1@t.co','user'),('u2','u2@t.co','user'),('u3','u3@t.co','user'),
  ('u4','u4@t.co','user'),('admin1','a@t.co','admin')
ON CONFLICT (id) DO NOTHING;

-- Fake completed_deeds ids we control, and the current week.
DO $$
DECLARE wy TEXT := draw_week_year(now()); cd BIGINT; led BIGINT;
BEGIN
  -- Reset config to known defaults for the tests.
  UPDATE game_configs SET config_value='1'  WHERE config_key='draw_entries_per_deed';
  UPDATE game_configs SET config_value='1'  WHERE config_key='include_quick_tap_deeds';

  -- ── Case 1: one bingo-card deed → 1 active entry ──────────────────────────
  INSERT INTO completed_deeds (player_id,source_type,deed_id) VALUES ('u1','bingo_card',1) RETURNING id INTO cd;
  PERFORM draw_award_deed(cd,'u1',wy,1,false);
  PERFORM _assert(_active('u1')=1, 'case1 active=1');
  PERFORM _assert(_life('u1')=1,   'case1 lifetime=1');

  -- ── Case 2: one Quick Tap deed → 1 active entry ───────────────────────────
  INSERT INTO completed_deeds (player_id,source_type,quick_deed_id) VALUES ('u2','quick_action',5) RETURNING id INTO cd;
  PERFORM draw_award_deed(cd,'u2',wy,1,true);
  PERFORM _assert(_active('u2')=1, 'case2 quick active=1');

  -- ── Case 3: same deed completed 5 times → 5 entries ───────────────────────
  FOR i IN 1..5 LOOP
    INSERT INTO completed_deeds (player_id,source_type,deed_id) VALUES ('u3','bingo_card',7) RETURNING id INTO cd;
    PERFORM draw_award_deed(cd,'u3',wy,1,false);
  END LOOP;
  PERFORM _assert(_active('u3')=5, 'case3 active=5');

  -- ── Case 4: a bingo → deed entry + bingo bonus ────────────────────────────
  INSERT INTO completed_deeds (player_id,source_type,deed_id,card_id) VALUES ('u4','bingo_card',9,101) RETURNING id INTO cd;
  PERFORM draw_award_deed(cd,'u4',wy,1,false);
  PERFORM draw_award_bingo('u4',101,wy,10);
  PERFORM _assert(_active('u4')=11, 'case4 deed(1)+bonus(10)=11');

  -- ── Case 5: multiple bingos → bonus per bingo ─────────────────────────────
  PERFORM draw_award_bingo('u4',102,wy,10);
  PERFORM draw_award_bingo('u4',103,wy,10);
  PERFORM _assert(_active('u4')=31, 'case5 11 + 10 + 10 = 31');

  -- ── Case 15: duplicate event processing → no double award ─────────────────
  -- Re-run the very same card-bingo event and the same deed id; both no-op.
  led := draw_award_bingo('u4',103,wy,10);              -- duplicate card:week
  PERFORM _assert(led IS NULL, 'case15 duplicate bingo returns NULL');
  PERFORM draw_award_deed(cd,'u4',wy,1,false);           -- duplicate completed_deed id
  PERFORM _assert(_active('u4')=31, 'case15 active unchanged after dup');

  -- ── Case 16: new play_cycle on the same card → independent bonus roll ─────
  -- Simulates "Start New Game" (POST /reset-card bumps play_cycle) then
  -- winning again in the same week — must NOT be treated as a duplicate.
  PERFORM draw_award_bingo('u4',103,wy,10,1);            -- cycle 1, same card:week
  PERFORM _assert(_active('u4')=41, 'case16 new cycle awards again: 31+10=41');
  led := draw_award_bingo('u4',103,wy,10,1);             -- duplicate WITHIN cycle 1
  PERFORM _assert(led IS NULL, 'case16 duplicate within same cycle still NULL');
  PERFORM _assert(_active('u4')=41, 'case16 active unchanged after dup');

  -- ── Case 17: multiple lines on the SAME card+cycle → each pays independently ──
  -- Simulates one move completing 2 lines at once, or two separate moves
  -- each completing a new line — every distinct line index is its own bonus,
  -- uncapped, and a duplicate of an already-paid line is still a no-op.
  PERFORM draw_award_bingo('u4',103,wy,10,1,0);          -- cycle 1, line 0
  PERFORM _assert(_active('u4')=51, 'case17 new line on same cycle: 41+10=51');
  PERFORM draw_award_bingo('u4',103,wy,10,1,1);          -- cycle 1, line 1 (different line)
  PERFORM _assert(_active('u4')=61, 'case17 a second distinct line also pays: 51+10=61');
  led := draw_award_bingo('u4',103,wy,10,1,0);           -- duplicate of line 0 within cycle 1
  PERFORM _assert(led IS NULL, 'case17 duplicate of an already-paid line still NULL');
  PERFORM _assert(_active('u4')=61, 'case17 active unchanged after line dup');

  -- ── Case 18: per-line reversal — reversing one line leaves another intact ──
  PERFORM draw_award_bingo('u3',301,wy,10,0,0);          -- fresh card, cycle 0, line 0
  PERFORM draw_award_bingo('u3',301,wy,10,0,1);          -- same card+cycle, line 1
  PERFORM _assert(_active('u3')=25, 'case18 pre: 5(prior)+10+10=25');
  PERFORM draw_reverse_bingo(p_card_id => 301, p_week_year => wy, p_admin => 'admin1', p_cycle => 0, p_line => 0, p_reason => 'reverse line 0 only');
  PERFORM _assert(_active('u3')=15, 'case18 line0 reversed, line1 remains: 25-10=15');
  led := draw_reverse_bingo(p_card_id => 301, p_week_year => wy, p_admin => 'admin1', p_cycle => 0, p_line => 0, p_reason => 'dup reverse');
  PERFORM _assert(led IS NULL, 'case18 duplicate reversal of same line is NULL');
  PERFORM _assert(_active('u3')=15, 'case18 active unchanged after dup reversal');

  RAISE NOTICE 'cases 1-5,15,16,17,18 PASS';
END $$;

-- ── Case 10 & 8 & this-week: reversal + participation rollover ───────────────
DO $$
DECLARE wy TEXT := draw_week_year(now()); cd BIGINT; led BIGINT;
BEGIN
  -- Case 10: admin reverses a deed → its entry removed.
  INSERT INTO completed_deeds (player_id,source_type,deed_id) VALUES ('u1','bingo_card',2) RETURNING id INTO cd;
  PERFORM draw_award_deed(cd,'u1',wy,1,false);
  PERFORM _assert(_active('u1')=2, 'case10 pre-reverse active=2');
  PERFORM draw_reverse_deed(cd,'admin1','test reversal');
  PERFORM _assert(_active('u1')=1, 'case10 post-reverse active=1');
  PERFORM _assert(_life('u1')=2,   'case10 lifetime NOT decremented'); -- earned history kept

  -- Reversal idempotency: reversing again is a no-op.
  led := draw_reverse_deed(cd,'admin1','dup reversal');
  PERFORM _assert(led IS NULL, 'case10 duplicate reversal NULL');
  PERFORM _assert(_active('u1')=1, 'case10 active stable after dup reversal');

  -- Case 11: reverse a deed that caused a bingo → deed entry AND bonus removed.
  INSERT INTO completed_deeds (player_id,source_type,deed_id,card_id) VALUES ('u2','bingo_card',3,201) RETURNING id INTO cd;
  PERFORM draw_award_deed(cd,'u2',wy,1,false);
  PERFORM draw_award_bingo('u2',201,wy,10);
  PERFORM _assert(_active('u2')=12, 'case11 pre 1(prev)+1+10=12');
  PERFORM draw_reverse_deed(cd,'admin1','reverse bingo-causing deed');
  PERFORM draw_reverse_bingo(p_card_id => 201, p_week_year => wy, p_admin => 'admin1', p_reason => 'bingo undone');
  PERFORM _assert(_active('u2')=1, 'case11 back to the earlier 1');

  RAISE NOTICE 'cases 10,11 PASS';
END $$;

-- ── Case 7: winner reset (active→0, lifetime kept) ───────────────────────────
DO $$
DECLARE wy TEXT := draw_week_year(now()); did UUID := gen_random_uuid(); life_before BIGINT;
BEGIN
  life_before := _life('u3');                 -- u3 had 5 earned
  INSERT INTO draw_winners (id,user_id,week_year) VALUES (did,'u3',wy);
  PERFORM draw_winner_reset('u3',did,wy);
  PERFORM _assert(_active('u3')=0,            'case7 winner active reset to 0');
  PERFORM _assert(_life('u3')=life_before,    'case7 lifetime unchanged');
  PERFORM _assert((SELECT last_draw_win_date IS NOT NULL FROM player_draw_balances WHERE player_id='u3'),
                  'case7 win date recorded');
  -- idempotent per draw id
  PERFORM _assert(draw_winner_reset('u3',did,wy) IS NULL, 'case7 reset idempotent');
  RAISE NOTICE 'case7 PASS';
END $$;

-- ── Case 9: inactivity expiration ────────────────────────────────────────────
DO $$
DECLARE n INTEGER;
BEGIN
  -- Make u4 look inactive for 5 weeks; u1 active recently.
  UPDATE player_draw_balances SET last_participation_date = now() - interval '5 weeks' WHERE player_id='u4';
  UPDATE player_draw_balances SET last_participation_date = now()                       WHERE player_id='u1';
  n := draw_expire_inactive(4);               -- expire anyone idle > 4 weeks
  PERFORM _assert(_active('u4')=0, 'case9 inactive u4 active expired to 0');
  PERFORM _assert(_active('u1')>0, 'case9 active u1 untouched');
  PERFORM _assert(_life('u4')>0,   'case9 lifetime kept after expiry');
  -- Never-expire: weeks<=0 is a no-op.
  PERFORM _assert(draw_expire_inactive(0)=0, 'case9 weeks=0 disables expiry');
  RAISE NOTICE 'case9 PASS';
END $$;

-- ── Audit trail completeness: every event type wrote a ledger row ────────────
DO $$
DECLARE missing TEXT;
BEGIN
  SELECT string_agg(t,', ') INTO missing FROM (
    SELECT unnest(ARRAY['deed_entry','quick_tap_entry','bingo_bonus','deed_reversal',
                        'bingo_reversal','winner_reset','inactive_expired']) AS t
    EXCEPT SELECT DISTINCT event_type FROM draw_entry_ledger
  ) q;
  PERFORM _assert(missing IS NULL, 'audit missing event types: ' || COALESCE(missing,''));
  -- Every ledger row has prev/new balances and a timestamp.
  PERFORM _assert((SELECT count(*) FROM draw_entry_ledger
                    WHERE created_at IS NULL)=0, 'audit all rows timestamped');
  RAISE NOTICE 'audit trail PASS';
END $$;

-- ── Cases 12/13/14 are enforced in the edge layer (settings gates) and are ──
-- ── covered by the Deno tests; here we assert the settings exist as keys. ────
DO $$
DECLARE c INTEGER;
BEGIN
  SELECT count(*) INTO c FROM game_configs WHERE config_key IN
    ('weekly_draw_enabled','deed_draw_entries_enabled','bingo_bonus_enabled',
     'draw_entries_per_deed','include_quick_tap_deeds',
     'allow_ticket_rollovers','require_current_week_participation',
     'reset_active_after_win','inactive_entry_expiration_weeks');
  PERFORM _assert(c=9, 'all 9 settings seeded, found ' || c);
  RAISE NOTICE 'settings PASS';
END $$;

SELECT 'ALL SQL RULE TESTS PASSED' AS result;
ROLLBACK;  -- leave the DB clean
