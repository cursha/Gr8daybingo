-- Continuing to play after a bingo was never blocked on the backend — a
-- player who wins can hit "Start New Game" (POST /reset-card) and keep
-- playing the SAME card for the rest of the week. Per-deed entries already
-- support this naturally (each completion is its own ledger row), but the
-- bingo bonus's idempotency key was (card_id, week_year) alone, so a second
-- win via reset-and-replay in the same week silently earned no bonus at all.
--
-- Fix: give each reset-to-win loop its own play_cycle, bumped by
-- /reset-card, and fold it into the bonus/reversal idempotency key. Retries
-- WITHIN the same cycle (e.g. a duplicate network request) still correctly
-- dedupe — only a genuine new cycle earns a fresh roll.

ALTER TABLE player_cards ADD COLUMN IF NOT EXISTS play_cycle INTEGER NOT NULL DEFAULT 0;

DROP FUNCTION IF EXISTS draw_award_bingo(TEXT, INTEGER, TEXT, BIGINT, TIMESTAMPTZ);

CREATE FUNCTION draw_award_bingo(
  p_player    TEXT,
  p_card_id   INTEGER,
  p_week_year TEXT,
  p_bonus     BIGINT,
  p_cycle     INTEGER DEFAULT 0,
  p_event_ts  TIMESTAMPTZ DEFAULT now()
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_bonus <= 0 THEN RETURN NULL; END IF;
  RETURN draw_apply(
    p_player          => p_player,
    p_event_type      => 'bingo_bonus',
    p_source_type     => 'bingo',
    p_source_event_id => 'card:' || p_card_id || ':week:' || p_week_year || ':cycle:' || p_cycle,
    p_amount          => p_bonus,
    p_week_year       => p_week_year,
    p_reason          => 'Bingo completed — bonus entries',
    p_card_id         => p_card_id,
    p_event_ts        => p_event_ts
  );
END;
$$;

DROP FUNCTION IF EXISTS draw_reverse_bingo(INTEGER, TEXT, TEXT, TEXT);

CREATE FUNCTION draw_reverse_bingo(
  p_card_id   INTEGER,
  p_week_year TEXT,
  p_admin     TEXT,
  p_cycle     INTEGER DEFAULT 0,
  p_reason    TEXT DEFAULT 'Bingo reversed by admin'
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  o RECORD;
BEGIN
  SELECT * INTO o FROM draw_entry_ledger
   WHERE event_type = 'bingo_bonus'
     AND source_event_id = 'card:' || p_card_id || ':week:' || p_week_year || ':cycle:' || p_cycle
   LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN draw_apply(
    p_player          => o.player_id,
    p_event_type      => 'bingo_reversal',
    p_source_type     => 'bingo',
    p_source_event_id => 'card:' || p_card_id || ':week:' || p_week_year || ':cycle:' || p_cycle,
    p_amount          => -o.amount,
    p_week_year       => o.week_year,
    p_reason          => p_reason,
    p_admin           => p_admin,
    p_card_id         => p_card_id
  );
END;
$$;

-- Keep the already-inert (guarded, one-time) historical backfill helper in
-- sync with the new signature via named notation, so it can't silently
-- misbind p_cycle if it's ever somehow invoked again. bingo_bonus_entries_
-- per_bingo no longer exists (removed in 20260715000000) so the bonus
-- amount here is just the historical default it always used to read.
CREATE OR REPLACE FUNCTION draw_backfill_from_history()
RETURNS TABLE(deeds_awarded BIGINT, bingos_awarded BIGINT) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE r RECORD; v_per BIGINT; v_bonus BIGINT := 10; v_inc_quick BOOLEAN;
        d BIGINT := 0; b BIGINT := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM draw_entry_ledger
              WHERE event_type IN ('deed_entry','quick_tap_entry','bingo_bonus')) THEN
    RAISE EXCEPTION 'Ledger already populated; refusing to backfill';
  END IF;

  SELECT COALESCE(config_value,'1')::BIGINT INTO v_per
    FROM game_configs WHERE config_key='draw_entries_per_deed';
  SELECT COALESCE(config_value,'1')='1' INTO v_inc_quick
    FROM game_configs WHERE config_key='include_quick_tap_deeds';

  FOR r IN SELECT id, player_id, source_type, card_id, completed_at
             FROM completed_deeds WHERE is_hidden_from_impact_board = false
            ORDER BY id LOOP
    IF r.source_type = 'quick_action' AND NOT v_inc_quick THEN CONTINUE; END IF;
    PERFORM draw_award_deed(
      r.id, r.player_id, draw_week_year(r.completed_at), v_per,
      (r.source_type = 'quick_action'), r.completed_at);
    d := d + 1;
  END LOOP;

  FOR r IN SELECT id, user_id, week_year, updated_at
             FROM player_cards WHERE is_bingo = true LOOP
    PERFORM draw_award_bingo(
      p_player => r.user_id, p_card_id => r.id, p_week_year => r.week_year,
      p_bonus => v_bonus, p_cycle => 0, p_event_ts => r.updated_at);
    b := b + 1;
  END LOOP;

  RETURN QUERY SELECT d, b;
END;
$$;
