-- A player can keep playing the same card past their first bingo, all the
-- way to end of week (frontend no longer blocks marking once is_bingo is
-- true). "A bingo" is redefined as any of the 12 possible lines (5 rows, 5
-- columns, 2 diagonals) becoming complete — not the single admin-configured
-- win_condition threshold. Every NEWLY-completed line earns its own
-- independent 6-20 roll, uncapped: if one move completes multiple lines at
-- once (including all 12 at once via fill_card), each pays out separately.
-- The configured win_condition still solely controls the one-time "you've
-- won" banner/email moment — it no longer gates or determines payout size.

ALTER TABLE player_cards ADD COLUMN IF NOT EXISTS bonus_lines_awarded JSONB NOT NULL DEFAULT '[]';

-- Add p_line so each line's bonus is independently idempotent:
-- card:<id>:week:<wy>:cycle:<c>:line:<n>. p_line stays nullable (not just
-- defaulted to a real line index like 0) so the historical backfill helper,
-- which predates per-line tracking, keeps its original whole-card key.
DROP FUNCTION IF EXISTS draw_award_bingo(TEXT, INTEGER, TEXT, BIGINT, INTEGER, TIMESTAMPTZ);

CREATE FUNCTION draw_award_bingo(
  p_player    TEXT,
  p_card_id   INTEGER,
  p_week_year TEXT,
  p_bonus     BIGINT,
  p_cycle     INTEGER DEFAULT 0,
  p_line      INTEGER DEFAULT NULL,
  p_event_ts  TIMESTAMPTZ DEFAULT now()
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_bonus <= 0 THEN RETURN NULL; END IF;
  RETURN draw_apply(
    p_player          => p_player,
    p_event_type      => 'bingo_bonus',
    p_source_type     => 'bingo',
    p_source_event_id => 'card:' || p_card_id || ':week:' || p_week_year || ':cycle:' || p_cycle
                          || CASE WHEN p_line IS NOT NULL THEN ':line:' || p_line ELSE '' END,
    p_amount          => p_bonus,
    p_week_year       => p_week_year,
    p_reason          => 'Bingo completed — bonus entries',
    p_card_id         => p_card_id,
    p_event_ts        => p_event_ts
  );
END;
$$;

DROP FUNCTION IF EXISTS draw_reverse_bingo(INTEGER, TEXT, TEXT, INTEGER, TEXT);

CREATE FUNCTION draw_reverse_bingo(
  p_card_id   INTEGER,
  p_week_year TEXT,
  p_admin     TEXT,
  p_cycle     INTEGER DEFAULT 0,
  p_line      INTEGER DEFAULT NULL,
  p_reason    TEXT DEFAULT 'Bingo reversed by admin'
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  o RECORD;
  v_key TEXT := 'card:' || p_card_id || ':week:' || p_week_year || ':cycle:' || p_cycle
                || CASE WHEN p_line IS NOT NULL THEN ':line:' || p_line ELSE '' END;
BEGIN
  SELECT * INTO o FROM draw_entry_ledger
   WHERE event_type = 'bingo_bonus'
     AND source_event_id = v_key
   LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN draw_apply(
    p_player          => o.player_id,
    p_event_type      => 'bingo_reversal',
    p_source_type     => 'bingo',
    p_source_event_id => v_key,
    p_amount          => -o.amount,
    p_week_year       => o.week_year,
    p_reason          => p_reason,
    p_admin           => p_admin,
    p_card_id         => p_card_id
  );
END;
$$;
