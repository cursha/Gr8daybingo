-- Admin Scoring Table (Issue: "add 4 corners to the bingo game" / scoring
-- points table) — replaces the old per-line random 6-20 roll with six named
-- milestones (one line, two lines, four corners, X pattern, around the
-- edges, fill card), independent of whichever win_condition is active. A
-- card can hit several of these on the way to (or past) its official win,
-- and each pays once per card. Bonus = the pattern's REAL (deed-only, never
-- purchased/referral/free) square count x a uniform random 1-4 roll — see
-- newlySatisfiedPatterns/realSquaresForPattern/awardBingoPatterns in
-- game/index.ts and awardPatternBonus in _shared/draw.ts.

ALTER TABLE player_cards ADD COLUMN IF NOT EXISTS bonus_patterns_awarded JSONB NOT NULL DEFAULT '[]';

-- Idempotency now keys on (card, pattern) alone rather than
-- (card, week, cycle, line) — a card_id is already unique per "life" since
-- tap-out inserts a new row rather than reusing the old one, so no other
-- disambiguation is needed.
DROP FUNCTION IF EXISTS draw_award_bingo(TEXT, INTEGER, TEXT, BIGINT, INTEGER, INTEGER, TIMESTAMPTZ);

CREATE FUNCTION draw_award_pattern_bonus(
  p_player    TEXT,
  p_card_id   INTEGER,
  p_pattern   TEXT,
  p_week_year TEXT,
  p_bonus     BIGINT,
  p_event_ts  TIMESTAMPTZ DEFAULT now()
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_bonus <= 0 THEN RETURN NULL; END IF;
  RETURN draw_apply(
    p_player          => p_player,
    p_event_type      => 'bingo_bonus',
    p_source_type     => 'bingo',
    p_source_event_id => 'card:' || p_card_id || ':pattern:' || p_pattern,
    p_amount          => p_bonus,
    p_week_year       => p_week_year,
    p_reason          => initcap(replace(p_pattern, '_', ' ')) || ' completed — bonus entries',
    p_card_id         => p_card_id,
    p_event_ts        => p_event_ts
  );
END;
$$;

DROP FUNCTION IF EXISTS draw_reverse_bingo(INTEGER, TEXT, TEXT, INTEGER, INTEGER, TEXT);

CREATE FUNCTION draw_reverse_pattern_bonus(
  p_card_id   INTEGER,
  p_pattern   TEXT,
  p_admin     TEXT,
  p_reason    TEXT DEFAULT 'Pattern bonus reversed by admin'
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  o RECORD;
  v_key TEXT := 'card:' || p_card_id || ':pattern:' || p_pattern;
BEGIN
  SELECT * INTO o FROM draw_entry_ledger
   WHERE event_type = 'bingo_bonus' AND source_event_id = v_key
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
