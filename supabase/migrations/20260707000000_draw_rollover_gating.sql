-- allow_ticket_rollovers has existed as a game_configs setting since the
-- weekly draw entry system shipped, but nothing ever read it — active_entries
-- persisted across weeks unconditionally regardless of the toggle's value.
-- This gives it real teeth: when OFF, every player's active entries are reset
-- to zero once the weekly draw has run, mirroring draw_expire_inactive's
-- loop-and-apply pattern so it's idempotent and concurrency-safe like every
-- other balance mutation in this system.

ALTER TABLE draw_entry_ledger DROP CONSTRAINT IF EXISTS draw_entry_ledger_event_type_check;
ALTER TABLE draw_entry_ledger ADD CONSTRAINT draw_entry_ledger_event_type_check CHECK (event_type IN (
  'deed_entry','quick_tap_entry','bingo_bonus',
  'deed_reversal','bingo_reversal','manual_adjust',
  'winner_reset','inactive_expired',
  'draw_winner_selected','setting_change','rollover_reset'
));

-- Zero every player's active entries for the week that just closed. Called
-- from runWeeklyDraw only when allow_ticket_rollovers is OFF, after the
-- winner-specific reset has already run (so the winner, if already zeroed,
-- is simply skipped by the active_entries > 0 filter below).
CREATE OR REPLACE FUNCTION draw_rollover_reset(p_week_year TEXT)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE r RECORD; n INTEGER := 0;
BEGIN
  IF p_week_year IS NULL THEN RETURN 0; END IF;
  FOR r IN
    SELECT player_id, active_entries FROM player_draw_balances WHERE active_entries > 0
  LOOP
    PERFORM draw_apply(
      p_player => r.player_id, p_event_type => 'rollover_reset', p_source_type => 'system',
      -- one reset per player per week: re-running the same week is a no-op.
      p_source_event_id => 'rollover:' || p_week_year || ':' || r.player_id,
      p_amount => -r.active_entries, p_week_year => p_week_year,
      p_reason => 'Ticket rollover disabled — active entries reset at end of week');
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
