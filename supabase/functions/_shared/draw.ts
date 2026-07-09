// =============================================================================
// Draw service — the Supabase-facing layer for the Weekly Draw Entry system.
// All balance mutation goes through the SECURITY DEFINER SQL functions
// (draw_award_deed, draw_award_bingo, draw_reverse_*, draw_winner_reset,
// draw_expire_inactive) so awarding is idempotent and concurrency-safe.
// =============================================================================
import { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  DrawSettings, parseDrawSettings, deedShouldAward, bingoShouldAward,
  isEligible, selectWeightedWinner, PoolCandidate, currentWeekYear, weekBounds,
} from './draw_logic.ts'

export type { DrawSettings } from './draw_logic.ts'
export { currentWeekYear, weekBounds } from './draw_logic.ts'

const SETTING_KEYS = [
  'weekly_draw_enabled','deed_draw_entries_enabled','draw_entries_per_deed',
  'bingo_bonus_enabled','include_quick_tap_deeds',
  'allow_ticket_rollovers','require_current_week_participation','reset_active_after_win',
  'inactive_entry_expiration_weeks','recent_winner_weight','recent_winner_months',
]

/** Load and parse the draw settings from game_configs (single round-trip). */
export async function getDrawSettings(supabase: SupabaseClient): Promise<DrawSettings> {
  const { data } = await supabase
    .from('game_configs').select('config_key, config_value').in('config_key', SETTING_KEYS)
  const raw: Record<string, string> = {}
  for (const r of data ?? []) raw[r.config_key] = r.config_value ?? ''
  return parseDrawSettings(raw)
}

// ── Awarding (called from the game function's completion handlers) ────────────

/** Award a deed's draw entry. No-op (returns false) when settings disable it or
 *  when the event was already processed (idempotent at the DB level). */
export async function awardDeedEntry(
  supabase: SupabaseClient,
  opts: {
    completedDeedId: number
    playerId: string
    weekYear: string
    sourceType: 'bingo_card' | 'quick_action'
    settings?: DrawSettings
  },
): Promise<boolean> {
  const settings = opts.settings ?? (await getDrawSettings(supabase))
  if (!deedShouldAward(settings, opts.sourceType)) return false
  const { data, error } = await supabase.rpc('draw_award_deed', {
    p_completed_deed_id: opts.completedDeedId,
    p_player: opts.playerId,
    p_week_year: opts.weekYear,
    p_per_deed: settings.entriesPerDeed,
    p_is_quick: opts.sourceType === 'quick_action',
  })
  if (error) { console.error('awardDeedEntry rpc error:', error); return false }
  return data != null // null = duplicate / no-op
}

/** Award the bonus for ONE completed line: a server-side random 6-20
 *  entries (never a fixed or client-supplied value — every line gets its
 *  own independent roll). Idempotent per (card, week, play cycle, line):
 *  draw_apply's unique index on (event_type, source_event_id) means a
 *  retried/duplicate call may roll again here, but only the first roll that
 *  actually inserts a new ledger row for that specific line is ever applied
 *  — a duplicate's roll is discarded, never double-awarded. A player who
 *  keeps playing the same card after their first win can complete more
 *  lines and earn more of these; a "Start New Game" reset (bumping cycle)
 *  resets which lines have been paid. Returns the awarded amount, or null
 *  if nothing was awarded. */
export async function awardBingoBonus(
  supabase: SupabaseClient,
  opts: { playerId: string; cardId: number; weekYear: string; cycle: number; lineIndex: number; settings?: DrawSettings },
): Promise<number | null> {
  const settings = opts.settings ?? (await getDrawSettings(supabase))
  if (!bingoShouldAward(settings)) return null
  const bonus = Math.floor(Math.random() * 15) + 6 // uniform 6-20 inclusive
  const { data, error } = await supabase.rpc('draw_award_bingo', {
    p_player: opts.playerId,
    p_card_id: opts.cardId,
    p_week_year: opts.weekYear,
    p_bonus: bonus,
    p_cycle: opts.cycle,
    p_line: opts.lineIndex,
  })
  if (error) { console.error('awardBingoBonus rpc error:', error); return null }
  return data != null ? bonus : null // null = duplicate / no-op
}

// ── Reversal (called from the admin reverse-deed endpoint) ────────────────────

export async function reverseDeedEntry(
  supabase: SupabaseClient, completedDeedId: number, adminId: string, reason?: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('draw_reverse_deed', {
    p_completed_deed_id: completedDeedId, p_admin: adminId,
    p_reason: reason ?? 'Deed reversed by admin',
  })
  if (error) { console.error('reverseDeedEntry rpc error:', error); return false }
  return data != null
}

export async function reverseBingoBonus(
  supabase: SupabaseClient, cardId: number, weekYear: string, cycle: number, lineIndex: number, adminId: string, reason?: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('draw_reverse_bingo', {
    p_card_id: cardId, p_week_year: weekYear, p_cycle: cycle, p_line: lineIndex, p_admin: adminId,
    p_reason: reason ?? 'Bingo reversed by admin',
  })
  if (error) { console.error('reverseBingoBonus rpc error:', error); return false }
  return data != null
}

export async function manualAdjust(
  supabase: SupabaseClient, playerId: string, adminId: string, amount: number, reason: string,
): Promise<boolean> {
  const { error } = await supabase.rpc('draw_manual_adjust', {
    p_player: playerId, p_admin: adminId, p_amount: amount, p_reason: reason, p_week_year: currentWeekYear(),
  })
  if (error) { console.error('manualAdjust rpc error:', error); return false }
  return true
}

// ── Weekly draw runner (called from weekly-reset) ─────────────────────────────

export interface DrawResult {
  ran: boolean
  already_ran: boolean
  winner_id: string | null
  winner_name: string | null
  winner_email: string | null
  eligible_players: number
  pool_entries: number
  week_year: string
  reason?: string
}

/** Run the weekly draw for `drawWeekYear` (the week that just ended).
 *  Weighted by ACTIVE entries, with the legacy recent-winner odds reduction
 *  preserved. Idempotent: refuses to run twice for the same week.            */
export async function runWeeklyDraw(
  supabase: SupabaseClient,
  drawWeekYear: string,
  rand01: () => number = () => {
    const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] / 4_294_967_296
  },
): Promise<DrawResult> {
  const settings = await getDrawSettings(supabase)
  const base: DrawResult = {
    ran: false, already_ran: false, winner_id: null, winner_name: null, winner_email: null,
    eligible_players: 0, pool_entries: 0, week_year: drawWeekYear,
  }

  if (!settings.weeklyDrawEnabled) return { ...base, reason: 'weekly_draw_disabled' }

  // Idempotent: one winner per week.
  const { data: existing } = await supabase
    .from('draw_winners').select('id, user_id').eq('week_year', drawWeekYear).maybeSingle()
  if (existing) return { ...base, already_ran: true, winner_id: existing.user_id }

  // Expire inactive players first so their stale entries don't sit in the pool.
  if (settings.inactiveExpirationWeeks > 0) {
    await supabase.rpc('draw_expire_inactive', { p_weeks: settings.inactiveExpirationWeeks })
  }

  // Candidate balances (active > 0).
  const { data: balances } = await supabase
    .from('player_draw_balances')
    .select('player_id, active_entries, last_participation_date')
    .gt('active_entries', 0)
  if (!balances || balances.length === 0) return { ...base, ran: true, reason: 'no_entries' }

  // Participation: who completed at least one deed during the draw week.
  // We derive participation from completed_deeds in the week window.
  let participated = new Set<string>()
  if (settings.requireParticipation) {
    const { start, end } = weekBounds(drawWeekYear)
    const { data: deeds } = await supabase
      .from('completed_deeds').select('player_id')
      .gte('completed_at', start.toISOString()).lt('completed_at', end.toISOString())
    participated = new Set((deeds ?? []).map((d: { player_id: string }) => d.player_id))
  }

  // Recent winners get reduced odds (preserve legacy behaviour, fixed config read).
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - settings.recentWinnerMonths)
  const { data: recent } = await supabase
    .from('draw_winners').select('user_id').gte('selected_at', cutoff.toISOString())
  const recentIds = new Set((recent ?? []).map((w: { user_id: string }) => w.user_id))

  const candidates: PoolCandidate[] = balances
    .map((b: { player_id: string; active_entries: number; last_participation_date: string | null }) => ({
      user_id: b.player_id,
      active_entries: Number(b.active_entries),
      last_participation_date: b.last_participation_date,
      is_recent_winner: recentIds.has(b.player_id),
    }))
    .filter((c: PoolCandidate) => isEligible(c, settings, participated.has(c.user_id) || !settings.requireParticipation))

  if (candidates.length === 0) return { ...base, ran: true, reason: 'no_eligible_players' }

  const winner = selectWeightedWinner(candidates, settings, rand01)
  if (!winner) return { ...base, ran: true, reason: 'no_eligible_players' }

  const poolEntries = candidates.reduce((s, c) => s + c.active_entries, 0)
  const winnerActive = candidates.find((c) => c.user_id === winner.user_id)?.active_entries ?? 0

  // Record the winner (existing table + new reporting columns).
  const drawId = crypto.randomUUID()
  await supabase.from('draw_winners').insert({
    id: drawId, user_id: winner.user_id, week_year: drawWeekYear,
    odds_weight: recentIds.has(winner.user_id) ? settings.recentWinnerWeight : 1.0,
    winning_active_entries: winnerActive, total_pool_entries: poolEntries,
    eligible_players: candidates.length,
  })

  // Audit the selection, then reset the winner's active entries if configured.
  await supabase.rpc('draw_record_selected', {
    p_player: winner.user_id, p_draw_id: drawId, p_week_year: drawWeekYear,
    p_pool: poolEntries, p_eligible: candidates.length,
  })
  if (settings.resetAfterWin) {
    await supabase.rpc('draw_winner_reset', {
      p_player: winner.user_id, p_draw_id: drawId, p_week_year: drawWeekYear,
    })
  } else {
    // Still record the win date even when not resetting.
    await supabase.from('player_draw_balances')
      .update({ last_draw_win_date: new Date().toISOString() }).eq('player_id', winner.user_id)
  }

  // When rollover is disabled, nobody carries entries into next week — win or
  // lose. Runs after the winner-specific reset above so it never double-counts
  // the winner's own zeroing (they're simply excluded by active_entries > 0).
  if (!settings.allowRollovers) {
    await supabase.rpc('draw_rollover_reset', { p_week_year: drawWeekYear })
  }

  // Winner display info for the notification email.
  const { data: u } = await supabase
    .from('users').select('email, first_name, name, username').eq('id', winner.user_id).maybeSingle()

  return {
    ran: true, already_ran: false, winner_id: winner.user_id,
    winner_name: u?.first_name ?? u?.name ?? u?.username ?? null,
    winner_email: u?.email ?? null,
    eligible_players: candidates.length, pool_entries: poolEntries, week_year: drawWeekYear,
  }
}

/* weekBounds + currentWeekYear are re-exported from ./draw_logic.ts (pure, tested). */
