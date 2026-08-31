// =============================================================================
// Deed-completion side effects: recording a completed deed for the Impact
// Board, the daily non-referred deed-rate gate, and the daily streak
// tracker. Shared by game/index.ts (mark-cell) and the quick-tap route
// handlers — extracted here so both can call the exact same logic instead
// of it drifting between copies.
// =============================================================================
import { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export interface StreakMilestoneRow { id: number; days_required: number; label: string; message: string }
export interface StreakUpdateResult {
  streak_updated: boolean
  current_streak_days: number
  longest_streak_days: number
  new_milestones: StreakMilestoneRow[]
}

/** Rolls founder_note_pct and, if selected and the player hasn't already
 *  got one queued/sent today, inserts a founder_note_queue row with a
 *  random 12-24h send delay. Cheap path first (config read, dice roll)
 *  before the more expensive daily-cap check + deed-text lookup, since the
 *  roll fails ~95% of the time at the default 5%. */
async function maybeQueueFounderNote(
  supabase: SupabaseClient,
  opts: { completedDeedId: number; playerId: string; deedId: number | null; quickDeedId: number | null },
): Promise<void> {
  const { data: cfg } = await supabase
    .from('game_configs').select('config_value').eq('config_key', 'founder_note_pct').maybeSingle()
  const pct = Math.max(0, Math.min(100, parseInt(cfg?.config_value ?? '5', 10) || 0))
  if (pct <= 0 || Math.random() * 100 >= pct) return

  // 1/day cap is by calendar date (UTC), not "within the last 24h" — a note
  // already scheduled OR sent for today's date blocks another one today,
  // regardless of when it was originally queued.
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
  const todayStartIso = todayStart.toISOString()
  const tomorrowStartIso = tomorrowStart.toISOString()
  const { data: existing } = await supabase
    .from('founder_note_queue')
    .select('id')
    .eq('user_id', opts.playerId)
    .or(
      `and(scheduled_send_at.gte.${todayStartIso},scheduled_send_at.lt.${tomorrowStartIso}),` +
      `and(sent_at.gte.${todayStartIso},sent_at.lt.${tomorrowStartIso})`,
    )
    .limit(1)
  if (existing && existing.length > 0) return // 1/day cap already hit

  const deedText = opts.deedId != null
    ? (await supabase.from('good_deeds').select('deed_text').eq('id', opts.deedId).maybeSingle()).data?.deed_text
    : opts.quickDeedId != null
    ? (await supabase.from('quick_deeds').select('label').eq('id', opts.quickDeedId).maybeSingle()).data?.label
    : null
  if (!deedText) return // nothing sensible to write a note about

  const delayMs = (12 + Math.random() * 12) * 60 * 60 * 1000 // random(12h, 24h)
  await supabase.from('founder_note_queue').insert({
    completed_deed_id: opts.completedDeedId,
    user_id: opts.playerId,
    deed_text_snapshot: deedText,
    scheduled_send_at: new Date(Date.now() + delayMs).toISOString(),
    status: 'pending',
  })
}

// Impact Board (Issue #14): record one completed deed, snapshotting the player's
// team + location + the deed's category AT COMPLETION TIME so history stays
// correct if they later move team/city. Fully best-effort — any failure here
// must NEVER block a player from marking a deed, so the whole body is guarded.
export async function recordCompletedDeed(
  supabase: SupabaseClient,
  opts: {
    playerId: string
    sourceType: 'bingo_card' | 'quick_action'
    deedId?: number | null
    quickDeedId?: number | null
    cardId?: number | null
    cellIndex?: number | null
    category?: string | null
  }
): Promise<number | null> {
  try {
    const { data: u } = await supabase
      .from('users').select('first_name, city, province_state, country_id').eq('id', opts.playerId).maybeSingle()
    let countryName: string | null = null
    if (u?.country_id) {
      const { data: c } = await supabase.from('countries').select('name').eq('id', u.country_id).maybeSingle()
      countryName = c?.name ?? null
    }
    const { data: tm } = await supabase
      .from('team_members').select('team_id').eq('user_id', opts.playerId).maybeSingle()
    let category = opts.category ?? null
    // Live lookup only for quick_action: bingo_card deeds use the frozen
    // category from card_data so history reflects the value at generation time.
    if (!category && opts.deedId != null && opts.sourceType === 'quick_action') {
      const { data: d } = await supabase.from('good_deeds').select('category').eq('id', opts.deedId).maybeSingle()
      category = d?.category ?? null
    }
    const { data: inserted } = await supabase.from('completed_deeds').insert({
      player_id: opts.playerId,
      team_id_at_completion: tm?.team_id ?? null,
      source_type: opts.sourceType,
      deed_id: opts.deedId ?? null,
      quick_deed_id: opts.quickDeedId ?? null,
      category,
      card_id: opts.cardId ?? null,
      cell_index: opts.cellIndex ?? null,
      city: u?.city ?? null,
      province_state: u?.province_state ?? null,
      country_id: u?.country_id ?? null,
      country_name: countryName,
    }).select('id').single()
    const completedDeedId = inserted?.id ?? null

    // Founder Note queueing is best-effort and must never affect the return
    // value above — completed_deeds already has its row; a failure here
    // shouldn't make the caller think the whole completion failed. Own
    // try/catch, separate from the one around the insert.
    if (completedDeedId != null) {
      try {
        await maybeQueueFounderNote(supabase, {
          completedDeedId,
          playerId: opts.playerId,
          deedId: opts.deedId ?? null,
          quickDeedId: opts.quickDeedId ?? null,
        })
      } catch (err) {
        console.error('[founder-note] queueing failed:', err)
      }
    }

    return completedDeedId
  } catch (_e) {
    // swallow — impact recording is never allowed to break gameplay
    return null
  }
}

// Trust gating (Curt): untrusted players are capped at a table-driven number
// of completed Gr8Day Deeds per rolling 24h. is_trusted is a single flag —
// set manually by an admin at any time, or automatically the moment a
// player's referral is validated (see auth-custom's /verify-email) — so this
// only needs one lookup, not a referral-table join.
// Returns { allowed } and a friendly message when blocked.
export async function checkDeedGate(
  supabase: SupabaseClient,
  user: { sub: string; email?: string }
): Promise<{ allowed: boolean; message?: string }> {
  try {
    const { data: cfg } = await supabase
      .from('game_configs').select('config_value').eq('config_key', 'non_referred_daily_deed_limit').maybeSingle()
    const limit = parseInt(cfg?.config_value ?? '3')
    if (!Number.isFinite(limit) || limit <= 0) return { allowed: true } // 0/disabled = unlimited

    // Trusted players (manually flagged, or auto-flagged via referral validation) are unlimited.
    const { data: userRow } = await supabase
      .from('users').select('is_trusted').eq('id', user.sub).maybeSingle()
    if (userRow?.is_trusted) return { allowed: true }

    // Not trusted: count completed deeds in the last rolling 24h.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: recent } = await supabase
      .from('completed_deeds').select('id', { count: 'exact', head: true })
      .eq('player_id', user.sub).gte('completed_at', since)
    if ((recent ?? 0) >= limit) {
      return {
        allowed: false,
        message: `You've reached the limit of ${limit} Gr8Day Deeds in 24 hours for players who haven't been referred yet. Ask a current player to invite you and you'll unlock unlimited deeds!`,
      }
    }
    return { allowed: true }
  } catch (_e) {
    return { allowed: true } // never block gameplay on a gate error
  }
}

export async function updatePlayerStreak(
  supabase: SupabaseClient,
  userId: string
): Promise<StreakUpdateResult> {
  const none: StreakUpdateResult = { streak_updated: false, current_streak_days: 0, longest_streak_days: 0, new_milestones: [] }

  const { data: cfg } = await supabase
    .from('game_configs').select('config_value').eq('config_key', 'streak_enabled').maybeSingle()
  if (cfg?.config_value !== 'true') return none

  // Calendar date in UTC (YYYY-MM-DD)
  const today = new Date().toISOString().slice(0, 10)

  const { data: userRow } = await supabase
    .from('users').select('current_streak_days, longest_streak_days, last_valid_deed_date')
    .eq('id', userId).maybeSingle()
  if (!userRow) return none

  const lastDate: string | null = userRow.last_valid_deed_date
  let current: number = userRow.current_streak_days ?? 0
  let longest: number = userRow.longest_streak_days ?? 0

  // Already counted a deed today — nothing to do
  if (lastDate === today) return { streak_updated: false, current_streak_days: current, longest_streak_days: longest, new_milestones: [] }

  const yd = new Date()
  yd.setUTCDate(yd.getUTCDate() - 1)
  const yesterday = yd.toISOString().slice(0, 10)

  if (!lastDate) {
    current = 1
  } else if (lastDate === yesterday) {
    current += 1
  } else {
    current = 1
  }
  if (current > longest) longest = current

  await supabase.from('users').update({
    current_streak_days: current,
    longest_streak_days: longest,
    last_valid_deed_date: today,
  }).eq('id', userId)

  // Award any newly reached milestones (UNIQUE constraint prevents duplicates)
  const { data: milestones } = await supabase
    .from('streak_milestones').select('id, days_required, label, message')
    .eq('is_active', true).lte('days_required', current).order('days_required')

  const newMilestones: StreakMilestoneRow[] = []
  for (const m of milestones ?? []) {
    const { error } = await supabase.from('player_streak_achievements')
      .insert({ user_id: userId, milestone_id: m.id })
    if (!error) newMilestones.push(m)
  }

  return { streak_updated: true, current_streak_days: current, longest_streak_days: longest, new_milestones: newMilestones }
}
