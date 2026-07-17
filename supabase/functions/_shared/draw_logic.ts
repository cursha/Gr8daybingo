// =============================================================================
// Pure draw logic — NO external imports so it is trivially unit-testable.
// (The Supabase-facing service lives in draw.ts and imports from here.)
// =============================================================================

export interface DrawSettings {
  weeklyDrawEnabled: boolean
  deedEntriesEnabled: boolean
  entriesPerDeed: number
  bingoBonusEnabled: boolean
  includeQuickTap: boolean
  allowRollovers: boolean
  requireParticipation: boolean
  resetAfterWin: boolean
  inactiveExpirationWeeks: number // 0 = never
  // preserved legacy tuning for recent-winner odds reduction
  recentWinnerWeight: number
  recentWinnerMonths: number
}

const bool = (v: string | undefined, dflt: boolean): boolean => {
  if (v === undefined || v === null || v === '') return dflt
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes'
}
const num = (v: string | undefined, dflt: number): number => {
  const n = parseFloat(v ?? '')
  return Number.isFinite(n) ? n : dflt
}
const int = (v: string | undefined, dflt: number): number => {
  const n = parseInt(v ?? '', 10)
  return Number.isFinite(n) ? n : dflt
}

/** Build a typed settings object from the raw game_configs key→value map. */
export function parseDrawSettings(raw: Record<string, string | null | undefined>): DrawSettings {
  const g = (k: string) => raw[k] ?? undefined
  return {
    weeklyDrawEnabled:       bool(g('weekly_draw_enabled'), true),
    deedEntriesEnabled:      bool(g('deed_draw_entries_enabled'), true),
    entriesPerDeed:          Math.max(0, int(g('draw_entries_per_deed'), 1)),
    bingoBonusEnabled:       bool(g('bingo_bonus_enabled'), true),
    includeQuickTap:         bool(g('include_quick_tap_deeds'), true),
    allowRollovers:          bool(g('allow_ticket_rollovers'), true),
    requireParticipation:    bool(g('require_current_week_participation'), true),
    resetAfterWin:           bool(g('reset_active_after_win'), true),
    inactiveExpirationWeeks: Math.max(0, int(g('inactive_entry_expiration_weeks'), 0)),
    recentWinnerWeight:      num(g('recent_winner_weight'), 0.05),
    recentWinnerMonths:      int(g('recent_winner_months'), 4),
  }
}

/** Should a completed deed of this source earn an entry, given settings? */
export function deedShouldAward(
  settings: DrawSettings,
  sourceType: 'bingo_card' | 'quick_action',
): boolean {
  if (!settings.weeklyDrawEnabled) return false
  if (!settings.deedEntriesEnabled) return false
  if (sourceType === 'quick_action' && !settings.includeQuickTap) return false
  return settings.entriesPerDeed > 0
}

/** Should a completed bingo earn the bonus, given settings? Amount is no
 *  longer config-driven — it's a random 6-20 roll (see awardBingoBonus). */
export function bingoShouldAward(settings: DrawSettings): boolean {
  return settings.weeklyDrawEnabled && settings.bingoBonusEnabled
}

export interface PoolCandidate {
  user_id: string
  active_entries: number
  last_participation_date: string | null
  is_recent_winner: boolean
  is_active: boolean
  user?: unknown
}

/** Filter a candidate to draw eligibility for a given week.
 *  - must be an active player (users.is_active — see flag-inactive-players)
 *  - active entries > 0
 *  - if participation required, must have participated in the draw week
 *    (caller decides participation; here we accept a precomputed flag)        */
export function isEligible(
  c: PoolCandidate,
  settings: DrawSettings,
  participatedThisWeek: boolean,
): boolean {
  if (!c.is_active) return false
  if (c.active_entries <= 0) return false
  if (settings.requireParticipation && !participatedThisWeek) return false
  return true
}

/** ISO week label, e.g. "2026-W26" — mirrors getCurrentWeekYear() in game/index.ts. */
export function currentWeekYear(d = new Date()): string {
  const thursday = new Date(d)
  thursday.setDate(d.getDate() + (4 - (d.getDay() || 7)))
  const year = thursday.getFullYear()
  const jan1 = new Date(year, 0, 1)
  const week = Math.ceil(((thursday.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** [start, end) UTC datetime bounds for an ISO week label (Mon→Mon). */
export function weekBounds(weekYear: string): { start: Date; end: Date } {
  const [yStr, wStr] = weekYear.split('-W')
  const year = parseInt(yStr), week = parseInt(wStr)
  const jan4 = new Date(Date.UTC(year, 0, 4))           // ISO week 1 contains Jan 4
  const jan4Day = jan4.getUTCDay() || 7
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1))
  const start = new Date(week1Monday)
  start.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7)
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 7)
  return { start, end }
}

export interface WeightedEntry { user_id: string; weight: number; user?: unknown }

/** Weighted random selection. `rand01` is a function returning [0,1).
 *  Weight = active_entries × (recent-winner penalty). Deterministic given rand01,
 *  which makes it unit-testable. Returns null for an empty/zero-weight pool.    */
export function selectWeightedWinner(
  candidates: PoolCandidate[],
  settings: DrawSettings,
  rand01: () => number,
): WeightedEntry | null {
  const pool: WeightedEntry[] = candidates
    .map((c) => ({
      user_id: c.user_id,
      weight: c.active_entries * (c.is_recent_winner ? settings.recentWinnerWeight : 1),
      user: c.user,
    }))
    .filter((p) => p.weight > 0)

  const total = pool.reduce((s, p) => s + p.weight, 0)
  if (pool.length === 0 || total <= 0) return null

  let r = rand01() * total
  for (const p of pool) {
    r -= p.weight
    if (r <= 0) return p
  }
  return pool[pool.length - 1] // floating-point safety net
}
