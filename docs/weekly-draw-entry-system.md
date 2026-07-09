# Weekly Draw Entry System — Implementation Summary (Issue #33)

## What changed, in one paragraph
Every completed Gr8Day deed now earns weekly-draw entries immediately (default **1
per deed**), not just bingos. Bingos still pay out, but as a configurable **bonus**
(default **10 per bingo**). Entries are tracked as **balances** (per-player counters),
never as millions of ticket rows. Every award, reversal, expiry, win-reset and manual
adjustment is written to an append-only **ledger** that doubles as the audit trail and
the idempotency mechanism. The weekly draw now selects a winner by **weighted random
choice on Active Draw Entries** (preserving the existing recent-winner odds reduction).

## Files

**New**
- `supabase/migrations/20260625000000_weekly_draw_entry_system.sql` — tables, RPCs, settings, backfill.
- `supabase/functions/_shared/draw_logic.ts` — pure logic (settings, eligibility, weighted selection, week math). No imports → unit-testable.
- `supabase/functions/_shared/draw.ts` — Supabase-facing service (award/reverse/adjust wrappers, `runWeeklyDraw`).
- `supabase/tests/draw_rules.sql` — SQL rule tests (run via `psql`).
- `supabase/tests/draw_logic.test.ts` — pure-logic tests (run via `deno test` or `npx tsx`).

**Edited**
- `supabase/functions/game/index.ts` — award hooks on every completion path + new admin endpoints.
- `supabase/functions/weekly-reset/index.ts` — delegates the draw to the shared, balance-based runner.

## 1. Database changes
- `player_draw_balances` — one row per player: `active_entries`, `lifetime_entries`,
  `this_week_entries` (+ `this_week_year`), `last_draw_win_date`,
  `last_participation_date`, `last_entry_earned_date`.
- `draw_entry_ledger` — one row per **event** (not per entry). Holds player/admin id,
  event type, source, amount, previous & new balance, week, reason, related deed/bingo/draw
  ids, timestamp. A partial **UNIQUE index on `(event_type, source_event_id)`** is what
  makes awards idempotent.
- `draw_winners` gains `winning_active_entries`, `total_pool_entries`, `eligible_players`
  for reporting (backward-compatible `ADD COLUMN IF NOT EXISTS`).
- All mutation flows through `SECURITY DEFINER` functions that lock the balance row, so
  concurrent or duplicate processing is safe: `draw_apply` (core), `draw_award_deed`,
  `draw_award_bingo`, `draw_reverse_deed`, `draw_reverse_bingo`, `draw_manual_adjust`,
  `draw_winner_reset`, `draw_record_selected`, `draw_expire_inactive`,
  `draw_backfill_from_history`.

## 2. Backend service logic
Award happens at the single choke point where a completed deed is recorded
(`recordCompletedDeed`, now returns the new `completed_deeds.id`). Each completion path
— **mark-cell, quick-tap, and the dare-spin auto-mark** — awards a deed entry keyed on
that id. Bingo transitions award the bonus keyed on `card:<id>:week:<wy>`. Purchased
squares do **not** earn a deed entry (a bought square isn't a completed deed) but can
still trigger the bingo bonus. All awards are gated by settings and idempotent.

The bingo bonus amount is a server-side random integer, uniform 6-20 inclusive, rolled
independently per completed bingo — never a fixed or client-supplied value.

## 3. Admin settings (auto-exposed by the existing admin-settings function)
`weekly_draw_enabled`, `deed_draw_entries_enabled`, `draw_entries_per_deed` (1),
`bingo_bonus_enabled`, `include_quick_tap_deeds`,
`allow_ticket_rollovers`, `require_current_week_participation`, `reset_active_after_win`,
`inactive_entry_expiration_weeks` (0 = never; set 1/2/4/8/12/custom). Because
admin-settings is a generic editor over `game_configs`, these appear automatically — no
admin-endpoint change was required.

## 4. Leaderboard / reporting
New admin endpoint `GET /admin/draw-leaderboard` returns, per player: Player Name,
This Week's Entries, Active Entries, Lifetime Entries, Last Draw Win, Last Participation
Date, and Current-Week-Eligible (Y/N). Individual only, as specified.

## 5. Weekly draw logic
`runWeeklyDraw(weekYear)`: confirm enabled → expire inactive → gather balances with
`active > 0` → drop players who didn't participate this week (when required) → weighted
random pick on active entries (recent winners down-weighted) → record winner (+ pool
stats) → audit the selection → reset winner's active entries if configured. Idempotent
per week. Invoked weekly by `weekly-reset`, and on demand via `POST /admin/run-draw`.

## 6. Audit trail
Every state change writes a ledger row with previous/new balance, reason, actor, related
ids and timestamp. Event types: `deed_entry`, `quick_tap_entry`, `bingo_bonus`,
`deed_reversal`, `bingo_reversal`, `manual_adjust`, `winner_reset`, `inactive_expired`,
`draw_winner_selected`. (Setting changes continue to be handled by admin-settings.)

## 7. Reversal logic
`POST /admin/reverse-deed`: removes the deed's entry; if removing that cell un-completes
the card's bingo (re-checked with the existing `checkBingo`), the bonus is reversed too;
the deed is hidden from the Impact Board. Reversals are compensating negative ledger
rows (history is never deleted) and are themselves idempotent.

## 8. Tests — all 15 spec cases pass
SQL suite (`draw_rules.sql`) covers 1–5, 7, 9, 10, 11, 15 + audit completeness + settings.
Logic suite (`draw_logic.test.ts`) covers 6, 8, 12, 13, 14 + weighted-selection
proportionality + week bounds. Verified locally against PostgreSQL 16 with all existing
migrations loaded.

## 9. Risks & edge cases found in the current codebase
1. **`weekly-reset` config bug (pre-existing).** The old `runWeeklyDraw` read
   `game_configs` with `.select('value').eq('key', …)`, but the table columns are
   `config_value`/`config_key`. So the recent-winner weight/months **silently fell back
   to defaults** and were never actually configurable. The new code reads the correct
   columns; the bug is gone in the path we now use.
2. **Dare-spin completions were invisible (pre-existing).** The dare-spin auto-mark
   marked a cell and detected bingo but **never called `recordCompletedDeed`**, so those
   deeds were missing from the Impact Board (Issue #14) and would have been missing from
   the draw. Now fixed: the auto-mark records the deed and awards its entry.
3. **"Every bingo" semantics.** A card reaches bingo once (then `is_bingo` stays true), so
   the bonus fires on each card's first transition, keyed per `(card, week)`. Multiple
   bingos come from multiple cards. If a card is reset and re-bingos in the same week, the
   per-(card,week) key intentionally prevents a second bonus — matching the existing
   "first transition" behaviour. Revisit if business wants re-bingos to re-pay.
4. **Lifetime entries never decrease.** Reversals, expiry and winner-resets reduce
   **active** entries only; lifetime is the earned history (consistent with rules 6 & 7).
   A reversed deed therefore still counts toward lifetime. Documented on purpose; flip in
   `draw_apply` if you want lifetime to track reversals.
5. **Backfill is opt-in.** Existing players start at zero. Run
   `SELECT * FROM draw_backfill_from_history();` once to reconstruct balances from
   `completed_deeds` + bingo cards. It refuses to run if the ledger already has awards.
6. **Legacy `draw_entries` table.** Left in place (harmless) for backward compatibility;
   the new draw no longer reads or writes it. Can be dropped in a later migration once
   nothing references it.
7. **`pg_cron` migration** (`20260611000002_schedule_weekly_reset.sql`) requires the
   `pg_cron` extension, which isn't present in a bare local Postgres. Unrelated to this
   feature, but note it when reproducing the schema locally.

## 10. Frontend touchpoints
- The 10 new settings render automatically in the existing admin settings screen (generic
  `game_configs` editor) — no frontend change needed to manage them.
- To surface the admin draw leaderboard, call `GET /admin/draw-leaderboard` and render the
  returned `players[]` (fields listed in §4). It mirrors the shape of the existing
  `/leaderboard/players` admin data, so it can slot into the same table component.
- Player-facing experience is unchanged and deliberately opaque: no entry counts or odds
  are exposed. The winner is notified by the existing prize-winner email; the in-app
  message to show on a win is simply: **"Congratulations! You won this week's Gr8Day Draw!"**

## How to deploy
1. Apply the migration (`supabase db push` or your migration runner).
2. Deploy the `game` and `weekly-reset` functions.
3. (Optional) Run `SELECT * FROM draw_backfill_from_history();` to seed balances.
4. Adjust any settings in the admin panel; defaults match the spec.
