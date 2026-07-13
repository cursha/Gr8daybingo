import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthUser, requireAuth, requireAdmin } from '../_shared/auth.ts'
import { getSupabase, getSubPath, matchPath } from '../_shared/db.ts'
import { sendEmail, passwordResetEmail, adminLockoutEmail, adminPasswordResetEmail, referralInviteEmail, bingoWinEmail, prizeClaimConfirmationEmail, prizeVoucherEmail, gameAnnouncementEmail, newGameLaunchEmail } from '../_shared/email.ts'
import {
  getDrawSettings, awardDeedEntry, awardBingoBonus,
  reverseDeedEntry, reverseBingoBonus, manualAdjust, runWeeklyDraw,
} from '../_shared/draw.ts'
import bcrypt from 'npm:bcryptjs@2'

// ── Types ────────────────────────────────────────────────────────────────────
interface Cell {
  index: number
  deed_text: string
  deed_text_long: string | null
  deed_id: number | null
  is_free_space: boolean
  is_purchasable: boolean
  purchase_price: number | null
  is_referral_free: boolean
  is_secret: boolean
  secret_reward: number | null
  secret_revealed?: boolean
  quantity: number
  category: string | null
  // I Bet Ya — snapshotted at generation, revealed on first center-cell click
  bet_ya_outcome_type?: string | null
  bet_ya_label?: string | null
  bet_ya_action_value?: number | null
  bet_ya_revealed?: boolean
}

// ── Security: strip secret fields before sending cells to client ─────────────
// is_secret/secret_reward and bet_ya outcome details must never be exposed
// until the respective square has been revealed by the player.
function sanitizeCells(cells: Cell[], completedCells: number[], hiddenCells?: number[]): unknown[] {
  const hiddenSet = new Set(hiddenCells ?? [])
  return cells.map((c) => {
    // Blackout fog: a still-hidden square's deed content must never reach the
    // client — otherwise a player could read the network response and know
    // what's under a square before revealing it.
    if (hiddenSet.has(c.index)) {
      return {
        index: c.index, is_free_space: false, is_purchasable: false, purchase_price: null,
        is_referral_free: false, is_secret: false, secret_reward: null, quantity: 1,
        category: null, deed_text: null, deed_text_long: null, deed_id: null,
        is_hidden: true,
      }
    }

    const secretRevealed = c.secret_revealed === true || completedCells.includes(c.index)
    const { is_secret, secret_reward, secret_revealed,
            bet_ya_outcome_type, bet_ya_label, bet_ya_action_value,
            ...rest } = c
    return {
      ...rest,
      ...(is_secret && secretRevealed ? { is_secret: true, secret_reward, secret_revealed: true } : {}),
      // Expose I Bet Ya details only after the player has clicked and revealed
      ...(c.bet_ya_revealed
        ? { bet_ya_outcome_type, bet_ya_label, bet_ya_action_value }
        : {}),
    }
  })
}

// ── Badge System ─────────────────────────────────────────────────────────────
function getBadge(totalDeeds: number): { name: string; emoji: string; next_name: string | null; next_emoji: string | null; deeds_to_next: number | null } {
  const tiers = [
    { min: 0,   name: 'Newcomer',  emoji: '🌱' },
    { min: 5,   name: 'Starter',   emoji: '⭐' },
    { min: 10,  name: 'Builder',   emoji: '🔨' },
    { min: 25,  name: 'Champion',  emoji: '🏆' },
    { min: 50,  name: 'Hero',      emoji: '🦸' },
    { min: 75,  name: 'Legend',    emoji: '🌟' },
    { min: 100, name: 'Expert',    emoji: '👑' },
  ]
  let current = tiers[0]
  let nextTier: typeof tiers[0] | null = tiers[1]
  for (let i = 0; i < tiers.length; i++) {
    if (totalDeeds >= tiers[i].min) {
      current = tiers[i]
      nextTier = tiers[i + 1] ?? null
    }
  }
  return {
    name: current.name,
    emoji: current.emoji,
    next_name: nextTier?.name ?? null,
    next_emoji: nextTier?.emoji ?? null,
    deeds_to_next: nextTier ? nextTier.min - totalDeeds : null,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getCurrentWeekYear(): string {
  const now = new Date()
  // ISO week number: Thursday of the week determines the year
  const thursday = new Date(now)
  thursday.setDate(now.getDate() + (4 - (now.getDay() || 7)))
  const year = thursday.getFullYear()
  const jan1 = new Date(year, 0, 1)
  const week = Math.ceil(
    ((thursday.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7,
  )
  return `${year}-W${String(week).padStart(2, '0')}`
}

function getWeekStart(weekYear: string): Date {
  const [year, weekStr] = weekYear.split('-W')
  const week = parseInt(weekStr)
  const jan1 = new Date(parseInt(year), 0, 1)
  const jan1Day = jan1.getDay() || 7 // Mon=1..Sun=7
  const daysToMonday = (8 - jan1Day) % 7
  const firstMonday = new Date(jan1)
  firstMonday.setDate(jan1.getDate() + daysToMonday)
  const weekStart = new Date(firstMonday)
  weekStart.setDate(firstMonday.getDate() + (week - 1) * 7)
  return weekStart
}

async function sha256Hex(str: string): Promise<string> {
  const data = new TextEncoder().encode(str)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Deterministic PRNG seeded from a hex string (Mulberry32). */
class SeededRandom {
  private s: number
  constructor(hexSeed: string) {
    this.s = (parseInt(hexSeed.slice(0, 8), 16) >>> 0) || 1
  }
  private next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
  randint(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }
  shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
  }
}

// The 12 possible bingo lines on a 5x5 card: 5 rows, 5 columns, 2 diagonals.
// Shared by checkBingo (win_condition threshold check) and
// completedLineIndices (per-line bonus tracking — see awardNewBingoLines).
const LINES: number[][] = (() => {
  const lines: number[][] = []
  for (let r = 0; r < 5; r++) lines.push([r * 5, r * 5 + 1, r * 5 + 2, r * 5 + 3, r * 5 + 4])
  for (let c = 0; c < 5; c++) lines.push([c, c + 5, c + 10, c + 15, c + 20])
  lines.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20])
  return lines
})()

/** Indices (0-11) of LINES that are fully satisfied by `completed`. A
 *  "bingo" for bonus-payout purposes is any of these — independent of
 *  whichever win_condition is configured (that only gates the one-time win
 *  banner/email, via checkBingo below). */
function completedLineIndices(completed: number[]): number[] {
  const s = new Set(completed)
  const result: number[] = []
  LINES.forEach((line, i) => { if (line.every((x) => s.has(x))) result.push(i) })
  return result
}

function checkBingo(completed: number[], winCondition: string): boolean {
  const s = new Set(completed)
  const sub = (line: number[]) => line.every((x) => s.has(x))
  switch (winCondition) {
    case 'one_line': return LINES.some(sub)
    case 'two_lines': return LINES.filter(sub).length >= 2
    case 'four_corners': return sub([0, 4, 20, 24])
    case 'x_pattern': return sub([0, 6, 12, 18, 24, 4, 8, 16, 20])
    case 'around_the_edges': return sub([0,1,2,3,4,5,9,10,14,15,19,20,21,22,23,24])
    case 'fill_card': return [...Array(25).keys()].every((x) => s.has(x))
    default: return false
  }
}

function parseJsonArr(raw: string | null | undefined): number[] {
  try { return JSON.parse(raw ?? '[]') } catch { return [] }
}

/** Fetch a player's targeting value IDs and a map of deed_id → Set of targeting_value_ids. */
async function fetchTargetingData(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
): Promise<{ playerValueIds: Set<number>; deedTargetingMap: Map<number, Set<number>> }> {
  const { data: userValues } = await supabase
    .from('user_targeting_values').select('targeting_value_id').eq('user_id', userId)
  const playerValueIds = new Set<number>((userValues ?? []).map((r) => Number(r.targeting_value_id)))

  const { data: deedValues } = await supabase
    .from('deed_targeting_values').select('deed_id, targeting_value_id')
  const deedTargetingMap = new Map<number, Set<number>>()
  for (const r of deedValues ?? []) {
    const deedId = Number(r.deed_id)
    const valueId = Number(r.targeting_value_id)
    if (!deedTargetingMap.has(deedId)) deedTargetingMap.set(deedId, new Set())
    deedTargetingMap.get(deedId)!.add(valueId)
  }

  return { playerValueIds, deedTargetingMap }
}

/** Filter deeds to those matching the player's targeting values.
 *  Deeds with no targeting entries are universal (always included).
 *  Falls back to `fallback` if fewer than `minCount` deeds survive.
 *  Returns candidates unchanged if the player has no targeting values set. */
function filterDeedsByTargeting<T extends { id: number }>(
  candidates: T[],
  playerValueIds: Set<number>,
  deedTargetingMap: Map<number, Set<number>>,
  fallback: T[],
  minCount = 24,
): T[] {
  if (playerValueIds.size === 0) return candidates
  const filtered = candidates.filter((d) => {
    const vals = deedTargetingMap.get(d.id)
    if (!vals || vals.size === 0) return true
    for (const v of vals) { if (playerValueIds.has(v)) return true }
    return false
  })
  return filtered.length >= minCount ? filtered : fallback
}

/** Free-space cells (the I BET YA centre) always count toward Bingo, even
 *  though they are never "marked". Returns their indices from the card data. */
function freeSpaceIndices(cells: Cell[]): number[] {
  return cells.filter((c) => c.is_free_space).map((c) => c.index)
}

// The check-then-insert/update race above every users write below (SELECT for
// a conflict, then write if none was found) has a window two concurrent
// requests can both pass. users_email_unique / users_username_unique
// (migration 20260708000000) are the real backstop — this turns the
// resulting Postgres unique-violation into the same friendly message the
// common-case pre-check already returns, instead of a raw 500.
function friendlyUsersConflictError(error: { code?: string; message?: string } | null): string | null {
  if (!error || error.code !== '23505') return null
  if (error.message?.includes('users_email_unique')) return 'An account with this email already exists.'
  if (error.message?.includes('users_username_unique')) return 'This username is already taken.'
  return 'That email or username is already in use.'
}

// good_deeds.category is NOT NULL with a FOREIGN KEY into deed_categories
// (migration 20260709000002) — every deed must carry a real category, no
// exceptions. 23502 = not-null violation, 23503 = foreign-key violation
// (an empty string or a name that isn't a real category).
function friendlyDeedCategoryError(error: { code?: string } | null): string | null {
  if (!error) return null
  if (error.code === '23502' || error.code === '23503') return 'A valid category is required.'
  return null
}

/** Runs `promise` after the response is sent instead of making the caller wait
 *  on it, using the edge runtime's background-task hook when available (so the
 *  work still completes even after the request finishes) and otherwise just
 *  letting it run detached. Never lets a failure surface to the caller. */
function backgroundTask(promise: Promise<unknown>): void {
  const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime
  const safe = promise.catch((err) => console.error('[background] task failed', err))
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(safe)
}

// Admin-editable via game_configs.game_announcement_prompt_template (Admin
// Panel → Announce New Game to All Players). Only used when the admin leaves
// "Additional Message" blank — see POST /admin/announce-game.
const DEFAULT_ANNOUNCE_PROMPT_TEMPLATE = `You write a short, warm note to include in this week's Havagr8day Bingo game announcement email, sent to every player when a new week's game starts.

This week's details:
Prize: {{PRIZE}}
Game Type: {{GAME_TYPE}}
Theme: {{THEME}}

Write 2-3 warm, genuine, playful sentences (plain text, no markdown, no quotes) getting players excited for this week's game. Vary your wording and angle each time you're called — don't just restate the prize/game type/theme as a list, weave them in naturally.

Respond with ONLY the note text, nothing else.`

/** Sends the "new game launch" email to every verified player, once per game
 *  cycle — see /generate-card, which is the only caller and only invokes this
 *  once it has atomically won the per-week_year claim in
 *  game_launch_notifications. Never throws: failures are logged per-recipient
 *  so one bad address can't take down the rest of the batch. */
async function sendGameLaunchEmails(supabase: ReturnType<typeof getSupabase>, weekYear: string): Promise<void> {
  const { data: players, error: playersErr } = await supabase
    .from('users')
    .select('email, first_name, name, username, last_valid_deed_date, created_at')
    .eq('email_verified', true)
    .eq('role', 'user')

  if (playersErr) {
    console.error('[game-launch-email] failed to load recipients', playersErr)
    return
  }
  if (!players || players.length === 0) return

  // Honour the email-usage notice on the registration page: a player who
  // hasn't played in 4 weeks stops getting the weekly announcement, out of
  // respect for their inbox. Measured from their last real deed, or from
  // signup if they've never played yet (so brand-new players still get a
  // few weeks of nudges before falling off the list).
  const fourWeeksAgo = new Date(Date.now() - 28 * 86_400_000).toISOString()
  const activeRecipients = players.filter((p) => {
    const referenceDate = p.last_valid_deed_date ?? p.created_at
    return !referenceDate || referenceDate >= fourWeeksAgo
  })

  let sent = 0
  let failed = 0
  for (const player of activeRecipients) {
    const firstName = player.first_name ?? player.name ?? player.username ?? null
    try {
      const tpl = newGameLaunchEmail(firstName)
      const result = await sendEmail({ to: player.email, subject: tpl.subject, html: tpl.html })
      if (result.sent) sent++
      else failed++
    } catch (err) {
      failed++
      console.error('[game-launch-email] send failed for', player.email, err)
    }
  }
  console.log(`[game-launch-email] week ${weekYear}: sent=${sent} failed=${failed} skipped_inactive=${players.length - activeRecipients.length}`)
}

const WIN_LABELS: Record<string, string> = {
  one_line: 'One Line', two_lines: 'Two Lines', four_corners: 'Four Corners',
  x_pattern: 'X Pattern', around_the_edges: 'Around the Edges', fill_card: 'Fill the Card',
}
function winLabel(cond: string): string { return WIN_LABELS[cond] ?? cond }

/** Award a fresh 6-20 roll for every newly-completed line (any of the 12
 *  possible rows/columns/diagonals) on this action, and send the one-time
 *  "you've won" email the first time the configured win_condition is
 *  satisfied. A "bingo" for payout purposes is any newly-completed line,
 *  independent of win_condition — uncapped: one move that completes several
 *  lines at once (including all 12 via fill_card) pays each one separately.
 *  A player keeps playing the same card past their first win, all the way
 *  to end of week, so this can fire repeatedly over a card's lifetime.
 *  Idempotent per (card, week, play cycle, line): a retried call may roll
 *  again, but only the first roll that actually inserts a new ledger row
 *  for that specific line is ever applied. Returns the total newly-awarded
 *  entries (0 if nothing new this action). Caller persists the updated
 *  bonus_lines_awarded list onto the card row. */
async function awardNewBingoLines(
  supabase: ReturnType<typeof getSupabase>,
  opts: {
    playerId: string
    cardId: number
    weekYear: string
    playCycle: number
    newLineIndices: number[]
    winCondition: string
    wasAlreadyBingo: boolean
    isBingoNow: boolean
    userEmail?: string | null
    userName?: string | null
  },
): Promise<number> {
  let total = 0
  if (opts.newLineIndices.length > 0) {
    const drawSettings = await getDrawSettings(supabase)
    for (const lineIndex of opts.newLineIndices) {
      const bonus = await awardBingoBonus(supabase, {
        playerId: opts.playerId, cardId: opts.cardId, weekYear: opts.weekYear,
        cycle: opts.playCycle, lineIndex, settings: drawSettings,
      })
      if (bonus != null) total += bonus
    }
  }
  if (opts.isBingoNow && !opts.wasAlreadyBingo && opts.userEmail) {
    const tpl = bingoWinEmail(opts.userName ?? null, winLabel(opts.winCondition))
    await sendEmail({ to: opts.userEmail, subject: tpl.subject, html: tpl.html })
  }
  return total
}

/** Impact Board time filters: ISO start of the current month/quarter/year, or
 *  null for "life to date" (no lower bound). UTC-based. */
function impactPeriodStart(period: string): string | null {
  const now = new Date()
  const y = now.getUTCFullYear(), m = now.getUTCMonth()
  // Same ISO week boundary (Monday) the rest of the app already uses for
  // card generation — see getCurrentWeekYear/getWeekStart.
  if (period === 'week') return getWeekStart(getCurrentWeekYear()).toISOString()
  if (period === 'month') return new Date(Date.UTC(y, m, 1)).toISOString()
  if (period === 'quarter') return new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1)).toISOString()
  if (period === 'year') return new Date(Date.UTC(y, 0, 1)).toISOString()
  return null // 'all' / life-to-date
}

// ── Daily Streak Tracker ─────────────────────────────────────────────────────
interface StreakMilestoneRow { id: number; days_required: number; label: string; message: string }
interface StreakUpdateResult {
  streak_updated: boolean
  current_streak_days: number
  longest_streak_days: number
  new_milestones: StreakMilestoneRow[]
}

// Impact Board (Issue #14): record one completed deed, snapshotting the player's
// team + location + the deed's category AT COMPLETION TIME so history stays
// correct if they later move team/city. Fully best-effort — any failure here
// must NEVER block a player from marking a deed, so the whole body is guarded.
async function recordCompletedDeed(
  supabase: ReturnType<typeof getSupabase>,
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
      .from('users').select('city, province_state, country_id').eq('id', opts.playerId).maybeSingle()
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
    return inserted?.id ?? null
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
async function checkDeedGate(
  supabase: ReturnType<typeof getSupabase>,
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

async function updatePlayerStreak(
  supabase: ReturnType<typeof getSupabase>,
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

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  const url = new URL(req.url)
  const path = getSubPath(url, 'game')
  const method = req.method
  const supabase = getSupabase()

  try {
    const authUser = await getAuthUser(req)

    // ── GET /win-conditions ───────────────────────────────────────────────────
    if (method === 'GET' && path === '/win-conditions') {
      return jsonResponse({
        conditions: [
          { id: 'one_line', name: 'One Line', description: 'Complete 5 in a row (horizontal, vertical, or diagonal)' },
          { id: 'two_lines', name: 'Two Lines', description: 'Complete any two full lines' },
          { id: 'four_corners', name: 'Four Corners', description: 'Complete all four corner squares' },
          { id: 'x_pattern', name: 'X Pattern', description: 'Complete both diagonals forming an X across the card' },
          { id: 'around_the_edges', name: 'Around the Edges', description: 'Complete all 16 perimeter squares around the card' },
          { id: 'fill_card', name: 'Fill the Card', description: 'Complete every square on the entire card' },
        ],
      })
    }

    // ── GET /my-card-status ───────────────────────────────────────────────────
    // Lets the frontend decide whether to show the Blackout mode picker
    // BEFORE ever calling /generate-card — a card, once it exists, is the
    // lock on mode choice (generate-card just returns it unchanged), so the
    // picker must never show once has_card is true.
    if (method === 'GET' && path === '/my-card-status') {
      const user = requireAuth(authUser)
      const { data: existing } = await supabase
        .from('player_cards').select('id').eq('user_id', user.sub).eq('week_year', getCurrentWeekYear()).maybeSingle()
      const { data: boCfg } = await supabase
        .from('game_configs').select('config_value').eq('config_key', 'blackout_enabled').maybeSingle()
      return jsonResponse({
        has_card: existing != null,
        blackout_offered: boCfg?.config_value === 'true',
      })
    }

    // ── POST /generate-card ───────────────────────────────────────────────────
    if (method === 'POST' && path === '/generate-card') {
      const user = requireAuth(authUser)
      const weekYear = getCurrentWeekYear()
      const body = await req.json().catch(() => ({}))

      // Read admin win condition
      const { data: wcCfg } = await supabase
        .from('game_configs').select('config_value').eq('config_key', 'win_condition').maybeSingle()
      const adminWinCondition = wcCfg?.config_value ?? 'one_line'

      // Blackout: a fog-of-war layer, not a different win condition — same
      // checkBingo/win_condition as classic. blackout_enabled controls
      // whether it's OFFERED as a choice this cycle, not forced on everyone.
      const { data: boCfg } = await supabase
        .from('game_configs').select('config_value').eq('config_key', 'blackout_enabled').maybeSingle()
      const blackoutOffered = boCfg?.config_value === 'true'
      const requestedMode = body.game_mode === 'blackout' ? 'blackout' : 'classic'
      if (requestedMode === 'blackout' && !blackoutOffered) {
        return errorResponse('Blackout is not available this week', 400)
      }
      const gameMode = blackoutOffered ? requestedMode : 'classic'

      // Check for existing card this week
      const { data: existing } = await supabase
        .from('player_cards')
        .select('*')
        .eq('user_id', user.sub)
        .eq('week_year', weekYear)
        .maybeSingle()

      if (existing) {
        let needsSave = false
        if (existing.win_condition !== adminWinCondition) {
          existing.win_condition = adminWinCondition
          needsSave = true
        }

        const cells: Cell[] = JSON.parse(existing.card_data)

        // Re-sync each cell's quantity from the current good_deeds table so that
        // when an admin changes a deed's quantity, existing cards pick it up
        // (card_data is a snapshot taken at generation time).
        // Category is intentionally NOT re-synced: it is frozen at generation
        // so that completed-deed history reflects the category in effect when
        // the player received their card, not any later admin edit.
        const deedIds = cells.map((c) => c.deed_id).filter((id): id is number => id != null)
        if (deedIds.length > 0) {
          const { data: freshDeeds } = await supabase
            .from('good_deeds').select('id, quantity').in('id', deedIds)
          const qtyById = new Map<number, number>()
          for (const d of freshDeeds ?? []) {
            qtyById.set(d.id, d.quantity ?? 1)
          }
          for (const c of cells) {
            if (c.deed_id != null && qtyById.has(c.deed_id)) {
              const freshQty = qtyById.get(c.deed_id)!
              if (c.quantity !== freshQty) {
                c.quantity = freshQty
                needsSave = true
              }
            }
          }
        }

        // Re-sync referral cells
        const { data: validRefs } = await supabase
          .from('referrals')
          .select('id')
          .eq('user_id', user.sub)
          .eq('is_validated', true)
        const allReferralPos = cells.filter((c) => c.is_referral_free).map((c) => c.index)
        const currentReferralCells = parseJsonArr(existing.referral_cells)
        if ((validRefs?.length ?? 0) > 0 &&
          JSON.stringify([...currentReferralCells].sort()) !== JSON.stringify([...allReferralPos].sort())) {
          existing.referral_cells = JSON.stringify(allReferralPos)
          needsSave = true
        }

        if (needsSave) {
          const completed = parseJsonArr(existing.completed_cells)
          const purchased = parseJsonArr(existing.purchased_cells)
          const referral = parseJsonArr(existing.referral_cells)
          const allCompleted = [...new Set([...completed, ...purchased, ...referral, ...freeSpaceIndices(cells)])]
          existing.is_bingo = checkBingo(allCompleted, existing.win_condition)
          existing.updated_at = new Date().toISOString()
          await supabase.from('player_cards').update({
            card_data: JSON.stringify(cells),
            win_condition: existing.win_condition,
            referral_cells: existing.referral_cells,
            is_bingo: existing.is_bingo,
            updated_at: existing.updated_at,
          }).eq('id', existing.id)
        }

        const completedIdx = parseJsonArr(existing.completed_cells) as number[]

        // Check if player is entered in this week's draw
        const { data: drawEntry } = await supabase
          .from('draw_entries').select('id').eq('user_id', user.sub).eq('week_year', existing.week_year).maybeSingle()

        let blackoutState: { hidden_cells: number[]; blocked_cells: number[]; active_group: number[] | null; is_paused: boolean } | null = null
        if (existing.game_mode === 'blackout') {
          const { data: bs } = await supabase.from('blackout_state').select('*').eq('card_id', existing.id).maybeSingle()
          blackoutState = {
            hidden_cells: bs?.hidden_cells ?? [],
            blocked_cells: bs?.blocked_cells ?? [],
            active_group: bs?.active_group ?? null,
            is_paused: bs?.is_paused ?? false,
          }
        }

        return jsonResponse({
          card_id: existing.id,
          week_year: existing.week_year,
          game_mode: existing.game_mode ?? 'classic',
          cells: sanitizeCells(cells, completedIdx, blackoutState?.hidden_cells),
          win_condition: existing.win_condition,
          completed_cells: completedIdx,
          purchased_cells: parseJsonArr(existing.purchased_cells),
          referral_cells: parseJsonArr(existing.referral_cells),
          is_bingo: existing.is_bingo ?? false,
          draw_entered: drawEntry != null,
          pick_three_used: existing.pick_three_used ?? false,
          blackout: blackoutState,
        })
      }

      // Build a new card — only use deeds from active categories
      const { data: activeCategories } = await supabase
        .from('deed_categories').select('name').eq('is_active', true)
      const activeCategoryNames = (activeCategories ?? []).map(c => c.name)

      let deedQuery = supabase.from('good_deeds').select('*').eq('is_active', true).eq('status', 'Approved')
      if (activeCategoryNames.length > 0) {
        deedQuery = deedQuery.in('category', activeCategoryNames)
      }
      const { data: deeds } = await deedQuery
      // Blackout needs a 25th deed too (the center is just another square —
      // no I-Bet-Ya, no free space), so it needs one more than classic.
      const deedsNeeded = gameMode === 'blackout' ? 25 : 24
      if (!deeds || deeds.length < deedsNeeded) {
        return errorResponse('Not enough active deeds in the selected categories to generate a card', 400)
      }

      const seed = await sha256Hex(`${user.email ?? user.sub}:${weekYear}`)
      const rng = new SeededRandom(seed)

      const { playerValueIds, deedTargetingMap } = await fetchTargetingData(supabase, user.sub)
      const targetedDeeds = filterDeedsByTargeting(deeds ?? [], playerValueIds, deedTargetingMap, deeds ?? [])

      const deedList = [...targetedDeeds]
      rng.shuffle(deedList)

      let cells: Cell[]
      let referralCellIndices: number[]

      if (gameMode === 'blackout') {
        // No special squares at all — no center free space, no purchasable,
        // no secret, no referral-free. Every one of the 25 cells is a plain
        // deed square, and every one starts hidden (blackout_state, below).
        const selectedDeeds = deedList.slice(0, 25)
        cells = Array.from({ length: 25 }, (_, i) => ({
          index: i,
          deed_text: selectedDeeds[i].deed_text,
          deed_text_long: selectedDeeds[i].deed_text_long ?? null,
          deed_id: selectedDeeds[i].id,
          is_free_space: false,
          is_purchasable: false,
          purchase_price: null,
          is_referral_free: false,
          is_secret: false,
          secret_reward: null,
          quantity: selectedDeeds[i].quantity ?? 1,
          category: selectedDeeds[i].category ?? null,
        }))
        referralCellIndices = []
      } else {
        const { data: cfgRows } = await supabase.from('game_configs').select('config_key, config_value')
        const cfg: Record<string, string> = {}
        for (const r of cfgRows ?? []) cfg[r.config_key] = r.config_value ?? ''

        const dollar1Pct = parseInt(cfg['dollar1_pct'] ?? '50')
        const dollar2Pct = parseInt(cfg['dollar2_pct'] ?? '30')
        const secret1Pct = parseInt(cfg['secret_reward_1_pct'] ?? '50')
        const secret2Pct = parseInt(cfg['secret_reward_2_pct'] ?? '30')

        const purchasableCount = rng.randint(1, 3)
        const referralFreeCount = 0
        const selectedDeeds = deedList.slice(0, 24)

        // Position assignment
        const availablePos = Array.from({ length: 25 }, (_, i) => i).filter((i) => i !== 12)
        rng.shuffle(availablePos)
        const purchasablePos = availablePos.slice(0, purchasableCount)
        const remaining = availablePos.slice(purchasableCount)
        const referralPos = remaining.slice(0, referralFreeCount)
        const afterReferral = remaining.slice(referralFreeCount)

        let secretPosition: number | null = afterReferral.length > 0
          ? afterReferral[0]
          : availablePos.find((p) => !purchasablePos.includes(p) && !referralPos.includes(p)) ?? null

        let secretReward: number | null = null
        if (secretPosition !== null) {
          const roll = rng.randint(1, 100)
          secretReward = roll <= secret1Pct ? 1.0 : roll <= secret1Pct + secret2Pct ? 2.0 : 5.0
        }

        const prices: number[] = purchasablePos.map(() => {
          const roll = rng.randint(1, 100)
          return roll <= dollar1Pct ? 0.5 : roll <= dollar1Pct + dollar2Pct ? 1.0 : 2.0
        })

        // Snapshot one I Bet Ya outcome onto the center cell (classic modes only).
        // fill_card (blackout) leaves the center as a plain free space.
        interface BetYaRow {
          id: number; label: string; odds_percent: number; action_type: string
          credit_amount: number; remove_amount: number; reward_amount: number
        }
        let betYaOutcomeType: string | null = null
        let betYaLabel: string | null = null
        let betYaActionValue: number | null = null
        if (adminWinCondition !== 'fill_card') {
          const { data: betYaRows } = await supabase
            .from('bet_ya_outcomes').select('id, label, odds_percent, action_type, credit_amount, remove_amount, reward_amount')
            .eq('is_active', true)
          const pool = (betYaRows ?? []) as BetYaRow[]
          if (pool.length > 0) {
            const total = pool.reduce((s, r) => s + Number(r.odds_percent), 0)
            const randBuf = new Uint32Array(1)
            crypto.getRandomValues(randBuf)
            let roll = (randBuf[0] / 4_294_967_296) * total
            let picked = pool[pool.length - 1]
            for (const r of pool) {
              roll -= Number(r.odds_percent)
              if (roll <= 0) { picked = r; break }
            }
            betYaOutcomeType = picked.action_type
            betYaLabel = picked.label
            // Freeze the one dollar amount relevant to this outcome type at
            // generation time — the reveal endpoint just reads bet_ya_action_value.
            betYaActionValue = picked.action_type === 'fund_credit' ? Number(picked.credit_amount)
              : picked.action_type === 'remove_funds' ? Number(picked.remove_amount)
              : picked.action_type === 'refer_friend' ? Number(picked.reward_amount)
              : 0
          }
        }

        cells = []
        let deedIdx = 0
        for (let i = 0; i < 25; i++) {
          if (i === 12) {
            cells.push({
              index: 12, deed_text: 'I Bet Ya!',
              deed_text_long: 'Tap the centre square to take the I BET YA challenge — you might win a little, lose a little, or get dared to refer a friend. The centre is a free space and always counts toward your Bingo.',
              deed_id: null, is_free_space: true, is_purchasable: false, purchase_price: null,
              is_referral_free: false, is_secret: false, secret_reward: null, quantity: 1, category: null,
              bet_ya_outcome_type: betYaOutcomeType,
              bet_ya_label: betYaLabel,
              bet_ya_action_value: betYaActionValue,
              bet_ya_revealed: false,
            })
          } else {
            const deed = selectedDeeds[deedIdx++]
            const isPurchasable = purchasablePos.includes(i)
            const priceIdx = purchasablePos.indexOf(i)
            const isSecret = i === secretPosition
            cells.push({
              index: i,
              deed_text: deed.deed_text,
              deed_text_long: deed.deed_text_long ?? null,
              deed_id: deed.id,
              is_free_space: false,
              is_purchasable: isPurchasable,
              purchase_price: isPurchasable ? prices[priceIdx] : null,
              is_referral_free: referralPos.includes(i),
              is_secret: isSecret,
              secret_reward: isSecret ? secretReward : null,
              quantity: deed.quantity ?? 1,
              category: deed.category ?? null,
            })
          }
        }

        // Check validated referrals to pre-mark referral squares
        const { data: validRefs } = await supabase
          .from('referrals').select('id').eq('user_id', user.sub).eq('is_validated', true)
        const allReferralPositions = cells.filter((c) => c.is_referral_free).map((c) => c.index)
        referralCellIndices = (validRefs?.length ?? 0) > 0 ? allReferralPositions : []
      }

      const { data: newCard, error: cardErr } = await supabase
        .from('player_cards')
        .insert({
          user_id: user.sub,
          week_year: weekYear,
          card_seed: seed,
          card_data: JSON.stringify(cells),
          win_condition: adminWinCondition,
          game_mode: gameMode,
          completed_cells: '[]',
          purchased_cells: '[]',
          referral_cells: JSON.stringify(referralCellIndices),
          is_bingo: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single()
      if (cardErr) throw cardErr

      let blackoutState: { hidden_cells: number[]; blocked_cells: number[]; active_group: number[] | null; is_paused: boolean } | null = null
      if (gameMode === 'blackout') {
        const allIndices = Array.from({ length: 25 }, (_, i) => i)
        await supabase.from('blackout_state').insert({
          card_id: newCard.id,
          hidden_cells: allIndices,
          blocked_cells: [],
          active_group: null,
          is_paused: false,
        })
        blackoutState = { hidden_cells: allIndices, blocked_cells: [], active_group: null, is_paused: false }
      }

      // Whichever card generation is first to claim this week_year fires the
      // one-time "new game launched" email to every verified player. The
      // PRIMARY KEY on game_launch_notifications is the real atomicity
      // guarantee — a concurrent second claim for the same week_year fails
      // this insert and simply never sends. Backgrounded so a Resend outage
      // or slow batch can never delay this player's own card generation.
      const { error: launchClaimErr } = await supabase
        .from('game_launch_notifications')
        .insert({ week_year: weekYear })
      if (!launchClaimErr) {
        backgroundTask(sendGameLaunchEmails(supabase, weekYear))
      }

      return jsonResponse({
        card_id: newCard.id,
        week_year: newCard.week_year,
        game_mode: gameMode,
        cells: sanitizeCells(cells, [], blackoutState?.hidden_cells),
        win_condition: adminWinCondition,
        completed_cells: [],
        purchased_cells: [],
        referral_cells: referralCellIndices,
        is_bingo: false,
        pick_three_used: false,
        blackout: blackoutState,
      })
    }

    // ── POST /mark-cell ───────────────────────────────────────────────────────
    if (method === 'POST' && path === '/mark-cell') {
      const user = requireAuth(authUser)
      const body = await req.json()
      const { card_id, cell_index } = body
      const markNote: string | null = body.note ? String(body.note).trim().slice(0, 500) || null : null

      const { data: card } = await supabase
        .from('player_cards').select('*')
        .eq('id', card_id).eq('user_id', user.sub).maybeSingle()
      if (!card) return errorResponse('Card not found', 404)

      const cells: Cell[] = JSON.parse(card.card_data)
      const cell = cells[cell_index]
      if (cell.is_purchasable) {
        return errorResponse('This is a purchasable square. Use the purchase endpoint.', 400)
      }

      const completed = parseJsonArr(card.completed_cells)
      const purchased = parseJsonArr(card.purchased_cells)
      const referral = parseJsonArr(card.referral_cells)
      if (completed.includes(cell_index)) return errorResponse('Cell already marked', 400)

      // Blackout: a square can only be completed once it's been revealed and
      // is sitting in the current open group — otherwise the fog mechanic
      // would be trivially bypassable by marking a still-hidden cell directly.
      let blackoutActiveGroup: number[] | null = null
      if (card.game_mode === 'blackout') {
        const { data: bs } = await supabase.from('blackout_state').select('active_group').eq('card_id', card_id).maybeSingle()
        blackoutActiveGroup = bs?.active_group ?? null
        if (!blackoutActiveGroup || !blackoutActiveGroup.includes(cell_index)) {
          return errorResponse('That square is not open in your current group', 400)
        }
      }

      // Referral gating: non-referred players are capped at N deeds / 24h.
      const gate = await checkDeedGate(supabase, user)
      if (!gate.allowed) return errorResponse(gate.message ?? 'Daily deed limit reached', 429)

      // Secret square reward
      let secretRewardAwarded: number | null = null
      if (cell.is_secret && !cell.secret_revealed && (cell.secret_reward ?? 0) > 0) {
        const reward = cell.secret_reward!
        let { data: wallet } = await supabase
          .from('player_wallets').select('*').eq('user_id', user.sub).maybeSingle()
        if (!wallet) {
          const { data: w } = await supabase
            .from('player_wallets')
            .insert({ user_id: user.sub, balance: 0 }).select().single()
          wallet = w
        }
        const newBalance = parseFloat(wallet.balance) + reward
        await supabase.from('player_wallets')
          .update({ balance: newBalance, updated_at: new Date().toISOString() })
          .eq('user_id', user.sub)
        await supabase.from('wallet_transactions').insert({
          user_id: user.sub,
          amount: reward,
          transaction_type: 'secret_reward',
          item_description: `Secret Square reward (+${reward.toFixed(2)} Gr8Day Bucks)`,
        })
        secretRewardAwarded = reward
        cell.secret_revealed = true
        cells[cell_index] = cell
      }

      completed.push(cell_index)
      const allCompleted = [...new Set([...completed, ...purchased, ...referral, ...freeSpaceIndices(cells)])]
      const isBingo = checkBingo(allCompleted, card.win_condition)

      // A "bingo" for bonus-payout purposes is any newly-completed line
      // (row/column/diagonal) — independent of win_condition, and the
      // player keeps playing this same card past their first win, so more
      // can complete later. See awardNewBingoLines.
      const existingLines: number[] = Array.isArray(card.bonus_lines_awarded) ? card.bonus_lines_awarded : []
      const newLineIndices = completedLineIndices(allCompleted).filter((i) => !existingLines.includes(i))

      await supabase.from('player_cards').update({
        card_data: JSON.stringify(cells),
        completed_cells: JSON.stringify(completed),
        is_bingo: isBingo,
        bonus_lines_awarded: JSON.stringify([...existingLines, ...newLineIndices]),
        updated_at: new Date().toISOString(),
      }).eq('id', card_id)

      // Blackout: this square is resolved (completed) — remove it from the
      // open group, closing the group (active_group -> null) once every
      // square in it has been either completed or passed.
      if (card.game_mode === 'blackout' && blackoutActiveGroup) {
        const remaining = blackoutActiveGroup.filter((i) => i !== cell_index)
        await supabase.from('blackout_state').update({
          active_group: remaining.length > 0 ? remaining : null,
          updated_at: new Date().toISOString(),
        }).eq('card_id', card_id)
      }

      // Log the mark action
      await supabase.from('cell_mark_log').insert({
        user_id: user.sub,
        card_id,
        cell_index,
        action: 'mark',
        note: markNote,
      })

      // Impact Board: record the completed deed (best-effort, never blocks the mark)
      const completedDeedId = await recordCompletedDeed(supabase, {
        playerId: user.sub,
        sourceType: 'bingo_card',
        deedId: (cell as { deed_id?: number | null }).deed_id ?? null,
        cardId: card_id,
        cellIndex: cell_index,
        category: (cell as { category?: string | null }).category ?? null,
      })

      // Weekly Draw: award a draw entry for this completed deed (idempotent, gated).
      const drawSettings = await getDrawSettings(supabase)
      if (completedDeedId != null) {
        await awardDeedEntry(supabase, {
          completedDeedId, playerId: user.sub, weekYear: card.week_year,
          sourceType: 'bingo_card', settings: drawSettings,
        })
      }

      // Award any newly-completed lines' bonuses + congratulate by email on first win.
      const bonusEntries = await awardNewBingoLines(supabase, {
        playerId: user.sub, cardId: card_id, weekYear: card.week_year, playCycle: card.play_cycle ?? 0,
        newLineIndices, winCondition: card.win_condition,
        wasAlreadyBingo: card.is_bingo, isBingoNow: isBingo,
        userEmail: user.email, userName: user.name as string | undefined,
      })

      // Update daily streak
      const streakResult = await updatePlayerStreak(supabase, user.sub)

      const resp: Record<string, unknown> = { success: true, completed_cells: completed, is_bingo: isBingo }
      if (secretRewardAwarded !== null) resp.secret_reward = secretRewardAwarded
      if (bonusEntries > 0) resp.draw_bonus_entries = bonusEntries
      if (streakResult.streak_updated) {
        resp.streak_update = {
          current_streak_days: streakResult.current_streak_days,
          longest_streak_days: streakResult.longest_streak_days,
          new_milestones: streakResult.new_milestones,
        }
      }
      return jsonResponse(resp)
    }

    // ── POST /reset-card ──────────────────────────────────────────────────────
    if (method === 'POST' && path === '/reset-card') {
      const user = requireAuth(authUser)
      const weekYear = getCurrentWeekYear()
      const { data: card } = await supabase
        .from('player_cards').select('*')
        .eq('user_id', user.sub).eq('week_year', weekYear).maybeSingle()
      if (!card) return errorResponse('No card to reset', 404)
      if (card.game_mode === 'blackout') return errorResponse('Not available in Blackout mode', 400)

      // A player can keep playing the same card past a win all the way to
      // end of week without ever resetting — this is a voluntary "start
      // over with a fresh card" action. Bump play_cycle and clear which
      // lines have been paid so far, so lines completed in the new cycle
      // are independently eligible for their own bonus roll.
      const nextCycle = (card.play_cycle ?? 0) + 1
      await supabase.from('player_cards').update({
        completed_cells: '[]',
        purchased_cells: '[]',
        referral_cells: '[]',
        is_bingo: false,
        play_cycle: nextCycle,
        bonus_lines_awarded: '[]',
        updated_at: new Date().toISOString(),
      }).eq('id', card.id)

      return jsonResponse({
        success: true,
        card_id: card.id,
        week_year: card.week_year,
        cells: sanitizeCells(JSON.parse(card.card_data), []),
        win_condition: card.win_condition,
        completed_cells: [], purchased_cells: [], referral_cells: [], is_bingo: false,
      })
    }

    // ── POST /blackout/reveal ─────────────────────────────────────────────────
    // Reveals one hidden cell plus 0-3 more via 8-directional flood-fill
    // through hidden cells only (table-driven odds). No timer: the player
    // just can't reveal again until every square in the resulting group is
    // resolved (completed via /mark-cell, or passed via /blackout/pass).
    if (method === 'POST' && path === '/blackout/reveal') {
      const user = requireAuth(authUser)
      const body = await req.json()
      const cellIndex = parseInt(body.cell_index)
      if (!Number.isFinite(cellIndex) || cellIndex < 0 || cellIndex > 24) {
        return errorResponse('cell_index required', 400)
      }

      const { data: card } = await supabase
        .from('player_cards').select('id, card_data, game_mode')
        .eq('user_id', user.sub).eq('week_year', getCurrentWeekYear()).maybeSingle()
      if (!card || card.game_mode !== 'blackout') return errorResponse('Not a Blackout card', 400)

      const { data: state } = await supabase.from('blackout_state').select('*').eq('card_id', card.id).maybeSingle()
      if (!state) return errorResponse('Blackout state missing', 500)
      if (state.is_paused) return errorResponse('Resume before revealing', 400)
      if (state.active_group && state.active_group.length > 0) {
        return errorResponse('Resolve every square in your current group before revealing again', 400)
      }

      const hidden: number[] = state.hidden_cells ?? []
      if (!hidden.includes(cellIndex)) return errorResponse('That square is not hidden', 400)

      // Roll the admin-configured table for 0-3 extra squares.
      const { data: probCfg } = await supabase
        .from('game_configs').select('config_value').eq('config_key', 'blackout_reveal_probability').maybeSingle()
      let weights: Record<string, number>
      try { weights = JSON.parse(probCfg?.config_value ?? '{}') } catch { weights = {} }
      const defaults: Record<string, number> = { '0': 55, '1': 25, '2': 15, '3': 5 }
      const randBuf = new Uint32Array(1)
      crypto.getRandomValues(randBuf)
      const roll = (randBuf[0] / 4_294_967_296) * 100
      let cum = 0, extra = 0
      for (const k of ['0', '1', '2', '3']) {
        cum += Number(weights[k] ?? defaults[k])
        if (roll <= cum) { extra = Number(k); break }
      }

      // Flood-fill from cellIndex through hidden cells only, 8-directional,
      // stopping at walls/edges — never crosses an already-revealed cell.
      const revealed = new Set<number>([cellIndex])
      const frontier = [cellIndex]
      const hiddenSet = new Set(hidden)
      hiddenSet.delete(cellIndex)
      while (revealed.size < 1 + extra && frontier.length > 0) {
        const cur = frontier.shift()!
        const row = Math.floor(cur / 5), col = cur % 5
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue
            if (revealed.size >= 1 + extra) break
            const r = row + dr, c = col + dc
            if (r < 0 || r > 4 || c < 0 || c > 4) continue
            const n = r * 5 + c
            if (hiddenSet.has(n)) { revealed.add(n); hiddenSet.delete(n); frontier.push(n) }
          }
        }
      }

      // Minimum Hidden Squares Remaining floor: trim the expansion (never the
      // clicked square itself) if it would drop hidden count below the floor.
      const { data: floorCfg } = await supabase
        .from('game_configs').select('config_value').eq('config_key', 'blackout_min_hidden_remaining').maybeSingle()
      const floor = parseInt(floorCfg?.config_value ?? '3')
      const newHiddenCount = hidden.length - revealed.size
      if (newHiddenCount < floor) {
        for (const idx of [...revealed]) {
          if (idx !== cellIndex) revealed.delete(idx)
        }
      }

      let newHidden = hidden.filter((i) => !revealed.has(i))
      // Endgame: exactly one hidden square left anywhere auto-reveals too —
      // never leave a single square dangling with nothing left to trigger it.
      if (newHidden.length === 1) {
        revealed.add(newHidden[0])
        newHidden = []
      }

      await supabase.from('blackout_state').update({
        hidden_cells: newHidden,
        active_group: [...revealed],
        updated_at: new Date().toISOString(),
      }).eq('card_id', card.id)

      const cells: Cell[] = JSON.parse(card.card_data)
      const revealedCells = [...revealed].map((i) => cells[i])
      return jsonResponse({ revealed: revealedCells, hidden_cells: newHidden, active_group: [...revealed] })
    }

    // ── POST /blackout/pass ───────────────────────────────────────────────────
    // Passes on one square within the current open group — permanently
    // blocks that square. The group closes (active_group -> null) once every
    // square in it has been resolved, by completion or by pass.
    if (method === 'POST' && path === '/blackout/pass') {
      const user = requireAuth(authUser)
      const body = await req.json()
      const cellIndex = parseInt(body.cell_index)
      if (!Number.isFinite(cellIndex)) return errorResponse('cell_index required', 400)

      const { data: card } = await supabase
        .from('player_cards').select('id, game_mode')
        .eq('user_id', user.sub).eq('week_year', getCurrentWeekYear()).maybeSingle()
      if (!card || card.game_mode !== 'blackout') return errorResponse('Not a Blackout card', 400)

      const { data: state } = await supabase.from('blackout_state').select('*').eq('card_id', card.id).maybeSingle()
      const activeGroup: number[] = state?.active_group ?? []
      if (!activeGroup.includes(cellIndex)) return errorResponse('That square is not open in your current group', 400)

      const remaining = activeGroup.filter((i) => i !== cellIndex)
      const blocked = [...(state?.blocked_cells ?? []), cellIndex]
      await supabase.from('blackout_state').update({
        blocked_cells: blocked,
        active_group: remaining.length > 0 ? remaining : null,
        updated_at: new Date().toISOString(),
      }).eq('card_id', card.id)

      return jsonResponse({ success: true, blocked_cells: blocked, active_group: remaining.length > 0 ? remaining : null })
    }

    // ── POST /blackout/pause ──────────────────────────────────────────────────
    // Only allowed between groups — there's nothing to "pause" mid-group
    // since there's no timer; this is purely a stepping-away state.
    if (method === 'POST' && path === '/blackout/pause') {
      const user = requireAuth(authUser)
      const { data: card } = await supabase
        .from('player_cards').select('id, game_mode')
        .eq('user_id', user.sub).eq('week_year', getCurrentWeekYear()).maybeSingle()
      if (!card || card.game_mode !== 'blackout') return errorResponse('Not a Blackout card', 400)

      const { data: state } = await supabase.from('blackout_state').select('active_group').eq('card_id', card.id).maybeSingle()
      if (state?.active_group && state.active_group.length > 0) {
        return errorResponse('Resolve every square in your current group before pausing', 400)
      }
      await supabase.from('blackout_state').update({ is_paused: true, updated_at: new Date().toISOString() }).eq('card_id', card.id)
      return jsonResponse({ success: true })
    }

    // ── POST /blackout/resume ─────────────────────────────────────────────────
    if (method === 'POST' && path === '/blackout/resume') {
      const user = requireAuth(authUser)
      const { data: card } = await supabase
        .from('player_cards').select('id, game_mode')
        .eq('user_id', user.sub).eq('week_year', getCurrentWeekYear()).maybeSingle()
      if (!card || card.game_mode !== 'blackout') return errorResponse('Not a Blackout card', 400)

      await supabase.from('blackout_state').update({ is_paused: false, updated_at: new Date().toISOString() }).eq('card_id', card.id)
      return jsonResponse({ success: true })
    }

    // ── POST /purchase-cell ───────────────────────────────────────────────────
    if (method === 'POST' && path === '/purchase-cell') {
      const user = requireAuth(authUser)
      const body = await req.json()
      const { card_id, cell_index } = body

      const { data: card } = await supabase
        .from('player_cards').select('*')
        .eq('id', card_id).eq('user_id', user.sub).maybeSingle()
      if (!card) return errorResponse('Card not found', 404)
      if (card.game_mode === 'blackout') return errorResponse('Not available in Blackout mode', 400)

      const cells: Cell[] = JSON.parse(card.card_data)
      const cell = cells[cell_index]
      if (!cell.is_purchasable) return errorResponse('This cell is not purchasable', 400)

      const purchased = parseJsonArr(card.purchased_cells)
      if (purchased.includes(cell_index)) return errorResponse('Cell already purchased', 400)

      const price = cell.purchase_price ?? 0
      const { data: wallet } = await supabase
        .from('player_wallets').select('*').eq('user_id', user.sub).maybeSingle()
      if (!wallet) return errorResponse('No wallet found. Please add funds first.', 400)

      const balance = parseFloat(wallet.balance)
      if (balance < price) {
        return errorResponse(`Insufficient Gr8Day Bucks. Need ${price}, have ${balance.toFixed(2)}`, 400)
      }

      const newBalance = balance - price
      await supabase.from('player_wallets')
        .update({ balance: newBalance, updated_at: new Date().toISOString() }).eq('user_id', user.sub)
      await supabase.from('wallet_transactions').insert({
        user_id: user.sub,
        amount: -price,
        transaction_type: 'purchase',
        item_description: `Purchased bingo square: ${cell.deed_text} (${price} Gr8Day Bucks)`,
      })

      purchased.push(cell_index)
      const completed = parseJsonArr(card.completed_cells)
      const referral = parseJsonArr(card.referral_cells)
      const allCompleted = [...new Set([...completed, ...purchased, ...referral, ...freeSpaceIndices(cells)])]
      const isBingo = checkBingo(allCompleted, card.win_condition)

      const existingLines: number[] = Array.isArray(card.bonus_lines_awarded) ? card.bonus_lines_awarded : []
      const newLineIndices = completedLineIndices(allCompleted).filter((i) => !existingLines.includes(i))

      await supabase.from('player_cards').update({
        purchased_cells: JSON.stringify(purchased),
        is_bingo: isBingo,
        bonus_lines_awarded: JSON.stringify([...existingLines, ...newLineIndices]),
        updated_at: new Date().toISOString(),
      }).eq('id', card_id)

      // Award any newly-completed lines' bonuses + congratulate by email on first win.
      // Note: a purchased square is not a completed deed, so it earns NO deed entry,
      // but it CAN complete lines, which still earn the random 6-20 bonus each.
      const bonusEntries = await awardNewBingoLines(supabase, {
        playerId: user.sub, cardId: card_id, weekYear: card.week_year, playCycle: card.play_cycle ?? 0,
        newLineIndices, winCondition: card.win_condition,
        wasAlreadyBingo: card.is_bingo, isBingoNow: isBingo,
        userEmail: user.email, userName: user.name as string | undefined,
      })

      const purchaseResp: Record<string, unknown> = { success: true, purchased_cells: purchased, new_balance: newBalance, is_bingo: isBingo }
      if (bonusEntries > 0) purchaseResp.draw_bonus_entries = bonusEntries
      return jsonResponse(purchaseResp)
    }

    // ── POST /pick-three ───────────────────────────────────────────────────────
    // Free, once-per-card power-up: the player chooses exactly 3 of their own
    // unplayed squares to swap for new deeds. Unlike the I-Bet-Ya replace_three
    // outcome (which randomly picks cells and explicitly excludes the hidden
    // secret square), the player can't tell which square is secret — sanitizeCells
    // never sends is_secret/secret_reward for an unrevealed cell — so the secret
    // square is a normal, selectable candidate here. If it's among the 3 chosen,
    // its exact reward carries over onto the new deed at that same index instead
    // of being lost, so the player never notices anything but a new deed there.
    if (method === 'POST' && path === '/pick-three') {
      const user = requireAuth(authUser)
      const body = await req.json()
      const cardId = Number(body.card_id)
      const indices: number[] = Array.isArray(body.cell_indices) ? [...new Set((body.cell_indices as unknown[]).map(Number))] : []
      if (!Number.isFinite(cardId)) return errorResponse('card_id is required', 400)
      if (indices.length !== 3 || indices.some((i) => !Number.isInteger(i))) {
        return errorResponse('cell_indices must contain exactly 3 distinct square indices', 400)
      }

      const { data: card } = await supabase
        .from('player_cards').select('*').eq('id', cardId).eq('user_id', user.sub).maybeSingle()
      if (!card) return errorResponse('Card not found', 404)
      if (card.game_mode === 'blackout') return errorResponse('Not available in Blackout mode', 400)
      if (card.pick_three_used) return errorResponse('Pick Three has already been used on this card', 400)

      const cells: Cell[] = JSON.parse(card.card_data)
      const completed = parseJsonArr(card.completed_cells) as number[]
      const purchased = parseJsonArr(card.purchased_cells) as number[]
      const referral = parseJsonArr(card.referral_cells) as number[]
      const allMarked = new Set([...completed, ...purchased, ...referral])

      // Eligible = an ordinary unplayed deed square. Deliberately does NOT
      // exclude is_secret (see header comment) — every other exclusion mirrors
      // replace_three's rule.
      const eligibleIndices = new Set(
        cells
          .filter((c) => c.index !== 12 && !c.is_free_space && !c.is_purchasable && !c.is_referral_free && !allMarked.has(c.index))
          .map((c) => c.index)
      )
      const invalid = indices.filter((i) => !eligibleIndices.has(i))
      if (invalid.length > 0) {
        return errorResponse('One or more selected squares are not eligible for Pick Three', 400)
      }

      const existingDeedIds = new Set(cells.map((c) => c.deed_id).filter((id): id is number => id != null))
      const { data: allDeeds } = await supabase.from('good_deeds').select('*').eq('is_active', true).eq('status', 'Approved')
      const { playerValueIds, deedTargetingMap } = await fetchTargetingData(supabase, user.sub)
      const basePool = (allDeeds ?? []).filter((d) => !existingDeedIds.has(d.id))
      const targetedPool = [...filterDeedsByTargeting(basePool, playerValueIds, deedTargetingMap, basePool)]

      const replaced: { index: number; old_deed: string; new_deed: string }[] = []
      for (const index of indices) {
        if (targetedPool.length === 0) break
        const targetCell = cells[index]
        const buf = new Uint32Array(1); crypto.getRandomValues(buf)
        const pick = Math.floor((buf[0] / 4_294_967_296) * targetedPool.length)
        const newDeed = targetedPool.splice(pick, 1)[0]
        existingDeedIds.add(newDeed.id)
        cells[index] = {
          ...targetCell,
          deed_text: newDeed.deed_text,
          deed_text_long: newDeed.deed_text_long ?? null,
          deed_id: newDeed.id,
          quantity: newDeed.quantity ?? 1,
          category: newDeed.category ?? null,
          // Carry the secret payload forward untouched if this was the hidden
          // square; otherwise make sure the new deed is definitely not secret.
          is_secret: targetCell.is_secret === true,
          secret_reward: targetCell.is_secret === true ? targetCell.secret_reward : null,
          secret_revealed: false,
        }
        replaced.push({ index, old_deed: targetCell.deed_text, new_deed: newDeed.deed_text })
      }

      await supabase.from('player_cards').update({
        card_data: JSON.stringify(cells),
        pick_three_used: true,
        updated_at: new Date().toISOString(),
      }).eq('id', cardId)

      return jsonResponse({
        success: true,
        replaced,
        cells: sanitizeCells(cells, completed),
      })
    }

    // ── POST /submit-referral ─────────────────────────────────────────────────
    if (method === 'POST' && path === '/submit-referral') {
      const user = requireAuth(authUser)
      const body = await req.json()
      const referredEmail = String(body.referred_email ?? '').trim().toLowerCase()

      if (user.email && user.email.toLowerCase() === referredEmail) {
        return errorResponse('You cannot refer yourself', 400)
      }

      const { data: existing } = await supabase
        .from('referrals').select('id')
        .eq('user_id', user.sub).eq('referred_email', referredEmail).maybeSingle()
      if (existing) return errorResponse('You have already referred this email', 400)

      // Record the referral as PENDING. The reward (the "Refer a Player" square)
      // is granted only when the friend actually registers with this email — see
      // the referral validation in the auth-custom /register endpoint. This blocks
      // the fake-email loophole and makes a referral mean a real new player.
      await supabase.from('referrals').insert({
        user_id: user.sub, referred_email: referredEmail, is_validated: false,
      })

      // Send the invitation email to the referred friend (best-effort).
      const referrerName = (user.name as string | undefined) ?? null
      const invite = referralInviteEmail(referrerName)
      const emailResult = await sendEmail({
        to: referredEmail,
        subject: invite.subject,
        html: invite.html,
        replyTo: user.email ?? undefined,
      })

      // Optional GetResponse integration
      const grApiKey = Deno.env.get('GETRESPONSE_API_KEY')
      if (grApiKey) {
        fetch('https://api.getresponse.com/v3/contacts', {
          method: 'POST',
          headers: { 'X-Auth-Token': `api-key ${grApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: referredEmail, campaign: { campaignId: 'default' } }),
        }).catch(() => { /* best effort */ })
      }

      return jsonResponse({
        success: true,
        message: 'Invitation sent! Your "Refer a Player" square unlocks when your friend creates an account.',
        email_sent: emailResult.sent,
      })
    }

    // ── GET /wallet ───────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/wallet') {
      const user = requireAuth(authUser)
      let { data: wallet } = await supabase
        .from('player_wallets').select('*').eq('user_id', user.sub).maybeSingle()
      if (!wallet) {
        const { data: w } = await supabase
          .from('player_wallets')
          .insert({ user_id: user.sub, balance: 0 }).select().single()
        wallet = w
      }
      return jsonResponse({ balance: parseFloat(wallet.balance), wallet_id: wallet.id })
    }

    // ── POST /wallet/add-funds ────────────────────────────────────────────────
    if (method === 'POST' && path === '/wallet/add-funds') {
      const user = requireAuth(authUser)
      const body = await req.json()
      const amount = parseFloat(body.amount ?? 0)
      if (amount <= 0) return errorResponse('Amount must be positive', 400)

      let { data: wallet } = await supabase
        .from('player_wallets').select('*').eq('user_id', user.sub).maybeSingle()
      if (!wallet) {
        const { data: w } = await supabase
          .from('player_wallets')
          .insert({ user_id: user.sub, balance: 0 }).select().single()
        wallet = w
      }

      const newBalance = parseFloat(wallet.balance) + amount
      await supabase.from('player_wallets')
        .update({ balance: newBalance, updated_at: new Date().toISOString() }).eq('user_id', user.sub)
      await supabase.from('wallet_transactions').insert({
        user_id: user.sub, amount, transaction_type: 'deposit',
        item_description: `Added ${amount} Gr8Day Bucks to wallet`,
      })
      return jsonResponse({ success: true, new_balance: newBalance })
    }

    // ── GET /wallet/transactions ──────────────────────────────────────────────
    if (method === 'GET' && path === '/wallet/transactions') {
      const user = requireAuth(authUser)
      const { data: txns } = await supabase
        .from('wallet_transactions').select('*')
        .eq('user_id', user.sub)
        .order('created_at', { ascending: false })
        .limit(50)
      return jsonResponse({
        transactions: (txns ?? []).map((t) => ({
          id: t.id,
          amount: parseFloat(t.amount),
          transaction_type: t.transaction_type,
          item_description: t.item_description ?? null,
          created_at: t.created_at ?? null,
        })),
      })
    }

    // ── GET /leaderboard ──────────────────────────────────────────────────────
    if (method === 'GET' && path === '/leaderboard') {
      const { data: cards } = await supabase.from('player_cards').select('*')
      const games: Record<string, { week_year: string; total_deeds: number; active_players: number; bingo_winners: number }> = {}
      for (const card of cards ?? []) {
        const wy = card.week_year
        const completed = parseJsonArr(card.completed_cells)
        if (!games[wy]) games[wy] = { week_year: wy, total_deeds: 0, active_players: 0, bingo_winners: 0 }
        if (completed.length > 0 || card.is_bingo) games[wy].active_players++
        games[wy].total_deeds += completed.length
        if (card.is_bingo) games[wy].bingo_winners++
      }
      const currentWy = getCurrentWeekYear()
      if (!games[currentWy]) games[currentWy] = { week_year: currentWy, total_deeds: 0, active_players: 0, bingo_winners: 0 }
      const sorted = Object.values(games).sort((a, b) => b.week_year.localeCompare(a.week_year))
      const ascending = [...sorted].reverse()
      const numberByWy: Record<string, number> = {}
      ascending.forEach((g, i) => { numberByWy[g.week_year] = i + 1 })
      const result = sorted.map((g) => ({ ...g, game_number: numberByWy[g.week_year], is_current: g.week_year === currentWy }))
      return jsonResponse({
        current_week_year: currentWy,
        games: result,
        total_games: result.length,
        grand_total_deeds: result.reduce((s, g) => s + g.total_deeds, 0),
      })
    }

    // ── GET /quick-tap-deeds/eligible ────────────────────────────────────────
    if (method === 'GET' && path === '/quick-tap-deeds/eligible') {
      requireAuth(authUser)
      const { data } = await supabase
        .from('good_deeds')
        .select('id, deed_text, deed_text_long, category, quick_tap_label')
        .eq('quick_tap_eligible', true)
        .eq('is_active', true)
        .eq('status', 'Approved')
        .not('quick_tap_label', 'is', null)
        .order('deed_text')
      return jsonResponse({ deeds: data ?? [] })
    }

    // ── GET /my-quick-taps ────────────────────────────────────────────────────
    if (method === 'GET' && path === '/my-quick-taps') {
      const user = requireAuth(authUser)
      const { data: custom } = await supabase
        .from('user_quick_tap_deeds')
        .select('deed_id, position, good_deeds(id, deed_text, deed_text_long, category, quick_tap_label, quick_tap_eligible, is_active, status)')
        .eq('user_id', user.sub)
        .order('position')
      const customDeeds = (custom ?? [])
        .map((r) => r.good_deeds as unknown as { id: number; deed_text: string; deed_text_long: string | null; category: string; quick_tap_label: string | null; quick_tap_eligible: boolean; is_active: boolean; status: string } | null)
        .filter((d): d is NonNullable<typeof d> => d != null && d.quick_tap_eligible && d.is_active && d.status === 'Approved' && d.quick_tap_label != null)
      if (customDeeds.length > 0) {
        return jsonResponse({ source: 'custom', deeds: customDeeds.map((d) => ({ id: d.id, deed_text: d.deed_text, deed_text_long: d.deed_text_long, category: d.category, quick_tap_label: d.quick_tap_label })) })
      }
      const { data: defaults } = await supabase
        .from('good_deeds')
        .select('id, deed_text, deed_text_long, category, quick_tap_label')
        .eq('quick_tap_eligible', true)
        .eq('quick_tap_default', true)
        .eq('is_active', true)
        .eq('status', 'Approved')
        .not('quick_tap_label', 'is', null)
        .order('deed_text')
      return jsonResponse({ source: 'default', deeds: defaults ?? [] })
    }

    // ── PUT /my-quick-taps ────────────────────────────────────────────────────
    if (method === 'PUT' && path === '/my-quick-taps') {
      const user = requireAuth(authUser)
      const body = await req.json()
      const deedIds: number[] = (body.deed_ids ?? []).map(Number).filter((n: number) => Number.isFinite(n) && n > 0)
      if (deedIds.length < 1 || deedIds.length > 3) return errorResponse('Choose 1 to 3 deeds', 400)
      const { data: valid } = await supabase
        .from('good_deeds').select('id').in('id', deedIds).eq('quick_tap_eligible', true).eq('is_active', true).eq('status', 'Approved').not('quick_tap_label', 'is', null)
      if ((valid ?? []).length !== deedIds.length) return errorResponse('One or more deeds are not eligible', 400)
      await supabase.from('user_quick_tap_deeds').delete().eq('user_id', user.sub)
      await supabase.from('user_quick_tap_deeds').insert(deedIds.map((id, i) => ({ user_id: user.sub, deed_id: id, position: i })))
      return jsonResponse({ success: true })
    }

    // ── POST /quick-taps/:deedId/tap ─────────────────────────────────────────
    const quickTapMatch = path.match(/^\/quick-taps\/(\d+)\/tap$/)
    if (method === 'POST' && quickTapMatch) {
      const user = requireAuth(authUser)
      const deedId = parseInt(quickTapMatch[1])
      const { data: deed } = await supabase.from('good_deeds').select('is_active, quick_tap_eligible, status').eq('id', deedId).maybeSingle()
      if (!deed?.is_active || !deed?.quick_tap_eligible || deed?.status !== 'Approved') return errorResponse('Deed not available for Quick Tap', 400)
      const gate = await checkDeedGate(supabase, user)
      if (!gate.allowed) return errorResponse(gate.message ?? 'Daily deed limit reached', 429)
      const completedId = await recordCompletedDeed(supabase, { playerId: user.sub, sourceType: 'quick_action', deedId })
      if (completedId != null) {
        await awardDeedEntry(supabase, { completedDeedId: completedId, playerId: user.sub, weekYear: getCurrentWeekYear(), sourceType: 'quick_action' })
      }
      const streakResult = await updatePlayerStreak(supabase, user.sub)
      const resp: Record<string, unknown> = { success: true }
      if (streakResult.streak_updated) {
        resp.streak_update = { current_streak_days: streakResult.current_streak_days, longest_streak_days: streakResult.longest_streak_days, new_milestones: streakResult.new_milestones }
      }
      return jsonResponse(resp)
    }

    // ── GET /spotlight-quick-tap ───────────────────────────────────────────────
    // Player-facing: only ever returns a deed while its stamped week matches
    // the current one — that's the entire expiry mechanism, no cleanup step.
    if (method === 'GET' && path === '/spotlight-quick-tap') {
      requireAuth(authUser)
      const { data } = await supabase
        .from('admin_spotlight_quick_tap')
        .select('deed_id, week_year, good_deeds(id, deed_text, deed_text_long, category, quick_tap_label)')
        .eq('id', 1).maybeSingle()

      const deed = data?.good_deeds as unknown as { id: number; deed_text: string; deed_text_long: string | null; category: string; quick_tap_label: string | null } | null
      if (!data || data.week_year !== getCurrentWeekYear() || !deed || deed.quick_tap_label == null) {
        return jsonResponse({ deed: null })
      }
      return jsonResponse({ deed })
    }

    // ── GET /pickup-prompt ──────────────────────────────────────────────────
    // Player-facing: one random reflective question shown at the mode-picker
    // step before a card is generated. Answering is always optional — a null
    // id here just means the frontend skips the step entirely.
    if (method === 'GET' && path === '/pickup-prompt') {
      requireAuth(authUser)
      const { data } = await supabase
        .from('card_pickup_prompts').select('id, question_text')
        .eq('is_active', true).eq('status', 'Approved')
      if (!data || data.length === 0) return jsonResponse({ id: null, question_text: null })
      const picked = data[Math.floor(Math.random() * data.length)]
      return jsonResponse({ id: picked.id, question_text: picked.question_text })
    }

    // ── POST /pickup-prompt-response ────────────────────────────────────────
    // The frontend only calls this when the player actually typed an answer —
    // skipping never hits this endpoint, so there's nothing to distinguish
    // "skipped" from "never asked" here.
    if (method === 'POST' && path === '/pickup-prompt-response') {
      const user = requireAuth(authUser)
      const body = await req.json()
      const promptId = parseInt(body.prompt_id)
      const responseText = String(body.response_text ?? '').trim()
      if (!Number.isFinite(promptId)) return errorResponse('prompt_id required', 400)
      if (!responseText) return errorResponse('response_text required', 400)
      const { error } = await supabase.from('player_prompt_responses').insert({
        user_id: user.sub,
        prompt_id: promptId,
        response_text: responseText.slice(0, 1000),
      })
      if (error) return errorResponse(error.message, 400)
      return jsonResponse({ success: true })
    }

    // ── Admin: GET /admin/card-pickup-prompts ─────────────────────────────────
    if (method === 'GET' && path === '/admin/card-pickup-prompts') {
      requireAdmin(authUser)
      const { data } = await supabase.from('card_pickup_prompts').select('*').order('id')
      return jsonResponse({ prompts: data ?? [] })
    }

    // ── Admin: POST /admin/card-pickup-prompts ────────────────────────────────
    if (method === 'POST' && path === '/admin/card-pickup-prompts') {
      requireAdmin(authUser)
      const body = await req.json()
      const questionText = String(body.question_text ?? '').trim()
      if (!questionText) return errorResponse('question_text required', 400)
      const { data, error } = await supabase.from('card_pickup_prompts').insert({
        question_text: questionText,
        is_active: body.is_active !== false,
        status: body.status ?? 'Draft',
        updated_at: new Date().toISOString(),
      }).select().single()
      if (error) return errorResponse(error.message, 400)
      return jsonResponse({ prompt: data })
    }

    // ── Admin: PUT /admin/card-pickup-prompts/:id ─────────────────────────────
    const promptUpdateMatch = method === 'PUT' && path.match(/^\/admin\/card-pickup-prompts\/(\d+)$/)
    if (promptUpdateMatch) {
      requireAdmin(authUser)
      const id = parseInt(promptUpdateMatch[1])
      const body = await req.json()
      const { data: existingRow } = await supabase.from('card_pickup_prompts').select('id').eq('id', id).maybeSingle()
      if (!existingRow) return errorResponse('Prompt not found', 404)
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (body.question_text != null) {
        const trimmed = String(body.question_text).trim()
        if (!trimmed) return errorResponse('question_text cannot be empty', 400)
        updates.question_text = trimmed
      }
      if (body.is_active != null) updates.is_active = Boolean(body.is_active)
      if (body.status != null) {
        const VALID_STATUSES = ['Draft', 'Review', 'Approved', 'Retired']
        if (!VALID_STATUSES.includes(body.status)) return errorResponse('Invalid status', 400)
        updates.status = body.status
      }
      const { data, error } = await supabase.from('card_pickup_prompts').update(updates).eq('id', id).select().single()
      if (error) return errorResponse(error.message, 400)
      return jsonResponse({ prompt: data })
    }

    // ── Admin: DELETE /admin/card-pickup-prompts/:id ──────────────────────────
    const promptDeleteMatch = method === 'DELETE' && path.match(/^\/admin\/card-pickup-prompts\/(\d+)$/)
    if (promptDeleteMatch) {
      requireAdmin(authUser)
      const id = parseInt(promptDeleteMatch[1])
      const { data: existingRow } = await supabase.from('card_pickup_prompts').select('id').eq('id', id).maybeSingle()
      if (!existingRow) return errorResponse('Prompt not found', 404)
      await supabase.from('card_pickup_prompts').delete().eq('id', id)
      return jsonResponse({ success: true })
    }

    // ── Admin: GET /admin/prompt-responses ────────────────────────────────────
    // Review queue for player-typed reflection answers before any of them can
    // appear publicly in Community Voices — nothing goes live unapproved.
    if (method === 'GET' && path === '/admin/prompt-responses') {
      requireAdmin(authUser)
      // user_id has no FK to users (matches this table's existing convention
      // elsewhere in the codebase), so PostgREST can't embed it — resolve
      // manually, same pattern as /public/world-deeds below.
      const { data } = await supabase
        .from('player_prompt_responses')
        .select('id, user_id, prompt_id, response_text, is_approved_for_display, created_at, card_pickup_prompts(question_text)')
        .order('created_at', { ascending: false })
        .limit(200)
      const rows = (data ?? []) as unknown as {
        id: number; user_id: string; prompt_id: number; response_text: string
        is_approved_for_display: boolean; created_at: string
        card_pickup_prompts: { question_text: string } | null
      }[]
      const userIds = [...new Set(rows.map((r) => r.user_id))]
      const { data: usersData } = await supabase.from('users').select('id, username').in('id', userIds)
      const usernameById = new Map((usersData ?? []).map((u) => [u.id, u.username as string | null]))
      return jsonResponse({
        responses: rows.map((r) => ({
          id: r.id,
          question_text: r.card_pickup_prompts?.question_text ?? '',
          response_text: r.response_text,
          username: usernameById.get(r.user_id) ?? null,
          is_approved_for_display: r.is_approved_for_display,
          created_at: r.created_at,
        })),
      })
    }

    // ── Admin: PUT /admin/prompt-responses/:id ────────────────────────────────
    const promptResponseApproveMatch = method === 'PUT' && path.match(/^\/admin\/prompt-responses\/(\d+)$/)
    if (promptResponseApproveMatch) {
      requireAdmin(authUser)
      const id = parseInt(promptResponseApproveMatch[1])
      const body = await req.json()
      const { data: existingRow } = await supabase.from('player_prompt_responses').select('id').eq('id', id).maybeSingle()
      if (!existingRow) return errorResponse('Response not found', 404)
      const { data, error } = await supabase
        .from('player_prompt_responses')
        .update({ is_approved_for_display: Boolean(body.is_approved_for_display) })
        .eq('id', id).select().single()
      if (error) return errorResponse(error.message, 400)
      return jsonResponse({ response: data })
    }

    // ── Admin: POST /admin/spotlight-quick-tap ────────────────────────────────
    // Re-POSTing with a different deed_id replaces the current spotlight deed
    // early — no separate "clear" endpoint. It only disappears on its own once
    // the week rolls over and admin hasn't set a new one for the new week.
    if (method === 'POST' && path === '/admin/spotlight-quick-tap') {
      requireAdmin(authUser)
      const body = await req.json()
      const deedId = parseInt(body.deed_id)
      if (!Number.isFinite(deedId)) return errorResponse('deed_id required', 400)

      const { data: deed } = await supabase
        .from('good_deeds').select('id').eq('id', deedId)
        .eq('quick_tap_eligible', true).eq('is_active', true).eq('status', 'Approved')
        .not('quick_tap_label', 'is', null)
        .maybeSingle()
      if (!deed) return errorResponse('Deed must be an active, approved, Quick-Tap-eligible deed with a Quick Tap label set', 400)

      await supabase.from('admin_spotlight_quick_tap').update({
        deed_id: deedId,
        week_year: getCurrentWeekYear(),
        set_at: new Date().toISOString(),
      }).eq('id', 1)

      return jsonResponse({ success: true })
    }

    // ── Admin: GET /admin/spotlight-quick-tap ─────────────────────────────────
    if (method === 'GET' && path === '/admin/spotlight-quick-tap') {
      requireAdmin(authUser)
      const { data } = await supabase
        .from('admin_spotlight_quick_tap')
        .select('deed_id, week_year, set_at, good_deeds(id, deed_text, category)')
        .eq('id', 1).maybeSingle()
      return jsonResponse({
        active: data?.week_year === getCurrentWeekYear(),
        deed: data?.good_deeds ?? null,
        week_year: data?.week_year ?? null,
      })
    }

    // ── GET /quick-deeds ─────────────────────────────────────────────────────
    if (method === 'GET' && path === '/quick-deeds') {
      const { data } = await supabase
        .from('quick_deeds')
        .select('id, label, emoji, display_order')
        .eq('is_active', true)
        .order('display_order')
      return jsonResponse({ quick_deeds: data ?? [] })
    }

    // ── POST /quick-deeds/:id/tap ─────────────────────────────────────────────
    const quickDeedTapMatch = path.match(/^\/quick-deeds\/(\d+)\/tap$/)
    if (method === 'POST' && quickDeedTapMatch) {
      const user = requireAuth(authUser)
      const deedId = parseInt(quickDeedTapMatch[1])

      // Referral gating: non-referred players are capped at N deeds / 24h.
      const qGate = await checkDeedGate(supabase, user)
      if (!qGate.allowed) return errorResponse(qGate.message ?? 'Daily deed limit reached', 429)

      const { error } = await supabase
        .from('quick_deed_logs')
        .insert({ user_id: user.sub, quick_deed_id: deedId })
      if (error) throw error

      // Impact Board: a quick action is a completed deed (best-effort, non-blocking)
      const quickDeedId = await recordCompletedDeed(supabase, {
        playerId: user.sub,
        sourceType: 'quick_action',
        quickDeedId: deedId,
      })

      // Weekly Draw: award a draw entry for this quick-tap deed (idempotent, gated).
      if (quickDeedId != null) {
        await awardDeedEntry(supabase, {
          completedDeedId: quickDeedId, playerId: user.sub, weekYear: getCurrentWeekYear(),
          sourceType: 'quick_action',
        })
      }

      // Update daily streak
      const streakResult = await updatePlayerStreak(supabase, user.sub)
      const resp: Record<string, unknown> = { success: true }
      if (streakResult.streak_updated) {
        resp.streak_update = {
          current_streak_days: streakResult.current_streak_days,
          longest_streak_days: streakResult.longest_streak_days,
          new_milestones: streakResult.new_milestones,
        }
      }
      return jsonResponse(resp)
    }

    // ── GET /quick-deeds/my-stats ─────────────────────────────────────────────
    if (method === 'GET' && path === '/quick-deeds/my-stats') {
      const user = requireAuth(authUser)
      const { data } = await supabase
        .from('quick_deed_logs')
        .select('quick_deed_id, quick_deeds(label, emoji)')
        .eq('user_id', user.sub)
      // Count per deed
      const counts: Record<number, { label: string; emoji: string; count: number }> = {}
      for (const row of (data ?? [])) {
        const id = row.quick_deed_id
        const deed = row.quick_deeds as unknown as { label: string; emoji: string } | null
        if (!counts[id]) counts[id] = { label: deed?.label ?? '', emoji: deed?.emoji ?? '', count: 0 }
        counts[id].count++
      }
      return jsonResponse({ stats: Object.values(counts) })
    }

    // ── Admin: GET /admin/deed-categories ────────────────────────────────────
    if (method === 'GET' && path === '/admin/deed-categories') {
      requireAdmin(authUser)
      const { data } = await supabase.from('deed_categories').select('*').order('name')
      return jsonResponse({ categories: data ?? [] })
    }

    // ── Admin: PUT /admin/deed-categories/:name ───────────────────────────────
    const catEditMatch = path.match(/^\/admin\/deed-categories\/([A-Z]+)$/)
    if (method === 'PUT' && catEditMatch) {
      requireAdmin(authUser)
      const name = catEditMatch[1]
      const body = await req.json()
      const updates: Record<string, unknown> = {}
      if (body.is_active !== undefined) updates.is_active = body.is_active
      if (body.description !== undefined) updates.description = body.description
      await supabase.from('deed_categories').update(updates).eq('name', name)
      return jsonResponse({ success: true })
    }

    // ── Admin: GET /admin/quick-deeds ────────────────────────────────────────
    if (method === 'GET' && path === '/admin/quick-deeds') {
      requireAdmin(authUser)
      const { data } = await supabase.from('quick_deeds').select('*').order('display_order')
      return jsonResponse({ quick_deeds: data ?? [] })
    }

    // ── Admin: POST /admin/quick-deeds ───────────────────────────────────────
    if (method === 'POST' && path === '/admin/quick-deeds') {
      requireAdmin(authUser)
      const body = await req.json()
      const { label, emoji, display_order } = body
      if (!label) return errorResponse('label is required', 400)
      const { data, error } = await supabase
        .from('quick_deeds')
        .insert({ label: String(label).trim(), emoji: emoji ?? '❤️', display_order: display_order ?? 0 })
        .select().single()
      if (error) throw error
      return jsonResponse({ success: true, quick_deed: data })
    }

    // ── Admin: PUT /admin/quick-deeds/:id ────────────────────────────────────
    const adminQdEditMatch = path.match(/^\/admin\/quick-deeds\/(\d+)$/)
    if (method === 'PUT' && adminQdEditMatch) {
      requireAdmin(authUser)
      const id = parseInt(adminQdEditMatch[1])
      const body = await req.json()
      const updates: Record<string, unknown> = {}
      if (body.label !== undefined) updates.label = String(body.label).trim()
      if (body.emoji !== undefined) updates.emoji = body.emoji
      if (body.display_order !== undefined) updates.display_order = body.display_order
      if (body.is_active !== undefined) updates.is_active = body.is_active
      await supabase.from('quick_deeds').update(updates).eq('id', id)
      return jsonResponse({ success: true })
    }

    // ── Admin: DELETE /admin/quick-deeds/:id ─────────────────────────────────
    const adminQdDeleteMatch = path.match(/^\/admin\/quick-deeds\/(\d+)$/)
    if (method === 'DELETE' && adminQdDeleteMatch) {
      requireAdmin(authUser)
      const id = parseInt(adminQdDeleteMatch[1])
      await supabase.from('quick_deeds').delete().eq('id', id)
      return jsonResponse({ success: true })
    }

    // ── GET /leaderboard/players ──────────────────────────────────────────────
    if (method === 'GET' && path === '/leaderboard/players') {
      const currentWy = getCurrentWeekYear()

      const { data: allCards } = await supabase
        .from('player_cards')
        .select('user_id, week_year, completed_cells, purchased_cells, referral_cells')

      const { data: allUsers } = await supabase
        .from('users')
        .select('id, first_name, last_name, username, player_number, city, province_state, country_id, last_valid_deed_date')

      const { data: countries } = await supabase.from('countries').select('id, name, code')
      const countryMap: Record<number, { name: string; code: string }> = {}
      for (const c of countries ?? []) countryMap[c.id] = { name: c.name, code: c.code }

      // Count deeds per user: all-time and this week (bingo cards)
      const allTime: Record<string, number> = {}
      const thisWeek: Record<string, number> = {}

      for (const card of (allCards ?? [])) {
        const completed: number[] = Array.isArray(card.completed_cells) ? card.completed_cells : parseJsonArr(card.completed_cells)
        const purchased: number[] = Array.isArray(card.purchased_cells) ? card.purchased_cells : parseJsonArr(card.purchased_cells)
        const referral: number[] = Array.isArray(card.referral_cells) ? card.referral_cells : parseJsonArr(card.referral_cells)
        const purchasedSet = new Set(purchased)
        const referralSet = new Set(referral)
        let count = 0
        for (const idx of completed) {
          if (!purchasedSet.has(idx) && !referralSet.has(idx) && idx !== 12) count++
        }
        allTime[card.user_id] = (allTime[card.user_id] ?? 0) + count
        if (card.week_year === currentWy) {
          thisWeek[card.user_id] = (thisWeek[card.user_id] ?? 0) + count
        }
      }

      // Add quick deed taps to deed counts
      const weekStart = getWeekStart(currentWy)
      const { data: quickLogs } = await supabase
        .from('quick_deed_logs')
        .select('user_id, tapped_at')
      for (const log of (quickLogs ?? [])) {
        allTime[log.user_id] = (allTime[log.user_id] ?? 0) + 1
        if (new Date(log.tapped_at) >= weekStart) {
          thisWeek[log.user_id] = (thisWeek[log.user_id] ?? 0) + 1
        }
      }

      // Count referrals per user (all-time)
      const { data: allReferrals } = await supabase.from('referrals').select('user_id')
      const referralCounts: Record<string, number> = {}
      for (const r of (allReferrals ?? [])) {
        referralCounts[r.user_id] = (referralCounts[r.user_id] ?? 0) + 1
      }

      const makeEntry = (u: NonNullable<typeof allUsers>[number], deeds: number) => {
        const country = u.country_id ? countryMap[u.country_id] : null
        const badge = getBadge(allTime[u.id] ?? 0)
        const referrals = referralCounts[u.id] ?? 0
        return {
          user_id: u.id,
          display_name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || `GR8-${u.player_number}`,
          username: u.username ?? null,
          player_number: u.player_number,
          city: u.city ?? null,
          country_name: country?.name ?? null,
          country_code: country?.code ?? null,
          deeds,
          referrals,
          badge_name: badge.name,
          badge_emoji: badge.emoji,
          last_played: u.last_valid_deed_date ?? null,
        }
      }

      const allTimeRanked = (allUsers ?? [])
        .map(u => makeEntry(u, allTime[u.id] ?? 0))
        .filter(u => u.deeds > 0)
        .sort((a, b) => b.deeds - a.deeds)

      const thisWeekRanked = (allUsers ?? [])
        .map(u => makeEntry(u, thisWeek[u.id] ?? 0))
        .filter(u => u.deeds > 0)
        .sort((a, b) => b.deeds - a.deeds)

      // ── Top 10 most-completed deeds ──────────────────────────────────────────
      // Fetch all cards with their cell data and tally deed completions
      const { data: allCardsWithCells } = await supabase
        .from('player_cards')
        .select('card_data, completed_cells, purchased_cells, referral_cells')

      const deedCounts: Record<number, number> = {}  // deed_id → count

      for (const card of (allCardsWithCells ?? [])) {
        const cells: Cell[] = (() => { try { return JSON.parse(card.card_data ?? '[]') } catch { return [] } })()
        const completed: number[] = Array.isArray(card.completed_cells) ? card.completed_cells : parseJsonArr(card.completed_cells)
        const purchased: number[] = Array.isArray(card.purchased_cells) ? card.purchased_cells : parseJsonArr(card.purchased_cells)
        const referral: number[] = Array.isArray(card.referral_cells) ? card.referral_cells : parseJsonArr(card.referral_cells)
        const purchasedSet = new Set(purchased)
        const referralSet = new Set(referral)

        for (const idx of completed) {
          if (purchasedSet.has(idx) || referralSet.has(idx) || idx === 12) continue
          const cell = cells.find(c => c.index === idx)
          if (cell?.deed_id) {
            deedCounts[cell.deed_id] = (deedCounts[cell.deed_id] ?? 0) + 1
          }
        }
      }

      const { data: allDeeds } = await supabase.from('good_deeds').select('id, deed_text, category')
      const topDeeds = Object.entries(deedCounts)
        .map(([id, count]) => {
          const deed = (allDeeds ?? []).find(d => d.id === parseInt(id))
          return { deed_id: parseInt(id), deed_text: deed?.deed_text ?? '', category: deed?.category ?? '', count }
        })
        .filter(d => d.deed_text)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)

      // ── Regional grouping ──────────────────────────────────────────────────
      const { data: thresholdCfg } = await supabase
        .from('game_configs').select('config_value').eq('config_key', 'country_promotion_threshold').maybeSingle()
      const promotionThreshold = parseInt(thresholdCfg?.config_value ?? '100')

      // Privacy/drill-down gate: a province only reveals its city breakdown once it
      // has at least this many players (admin-configurable). Keeps small areas from
      // exposing individuals and keeps the drill-down meaningful.
      const { data: geoThreshCfg } = await supabase
        .from('game_configs').select('config_value').eq('config_key', 'geo_drilldown_threshold').maybeSingle()
      const geoDrilldownThreshold = Math.max(1, parseInt(geoThreshCfg?.config_value ?? '5'))

      // Count players per country (all-time, any deeds)
      const playersByCountry: Record<string, number> = {}
      for (const u of (allUsers ?? [])) {
        const code = u.country_id ? (countryMap[u.country_id]?.code ?? null) : null
        if (!code) continue
        playersByCountry[code] = (playersByCountry[code] ?? 0) + 1
      }

      // Determine promoted countries (>= threshold, not CA or US)
      const ALWAYS_SHOWN = new Set(['CA', 'US'])
      const promotedCodes = new Set(
        Object.entries(playersByCountry)
          .filter(([code, count]) => !ALWAYS_SHOWN.has(code) && count >= promotionThreshold)
          .map(([code]) => code)
      )

      const regionOrder = ['CA', 'US', ...Array.from(promotedCodes).sort(), 'ROW']

      const getRegionCode = (countryCode: string | null): string => {
        if (!countryCode) return 'ROW'
        if (countryCode === 'CA' || countryCode === 'US') return countryCode
        if (promotedCodes.has(countryCode)) return countryCode
        return 'ROW'
      }

      const regionLabel = (code: string) => {
        if (code === 'ROW') return 'Rest of World'
        return countryMap[Object.keys(countryMap).find(id => countryMap[Number(id)]?.code === code) as any]?.name ?? code
      }

      // Group all-time and this-week into regions
      const buildRegions = (ranked: ReturnType<typeof makeEntry>[]) => {
        const buckets: Record<string, ReturnType<typeof makeEntry>[]> = {}
        for (const code of regionOrder) buckets[code] = []
        for (const entry of ranked) {
          const rc = getRegionCode(entry.country_code)
          if (!buckets[rc]) buckets[rc] = []
          buckets[rc].push(entry)
        }
        return regionOrder
          .filter(code => buckets[code]?.length > 0)
          .map(code => ({
            code,
            name: regionLabel(code),
            flag: code === 'CA' ? '🍁' : code === 'US' ? '🇺🇸' : code === 'ROW' ? '🌍' : '',
            players: buckets[code],
          }))
      }

      const regionsAllTime = buildRegions(allTimeRanked)
      const regionsThisWeek = buildRegions(thisWeekRanked)

      // ── Weekly trend (this week vs last week) ────────────────────────────────
      const lastWy = (() => {
        const [yr, wk] = currentWy.split('-W').map(Number)
        if (wk === 1) return `${yr - 1}-W52`
        return `${yr}-W${String(wk - 1).padStart(2, '0')}`
      })()

      let thisWeekDeeds = 0
      let lastWeekDeeds = 0
      for (const card of (allCards ?? [])) {
        const completed: number[] = Array.isArray(card.completed_cells) ? card.completed_cells : parseJsonArr(card.completed_cells)
        const purchased: number[] = Array.isArray(card.purchased_cells) ? card.purchased_cells : parseJsonArr(card.purchased_cells)
        const referral: number[] = Array.isArray(card.referral_cells) ? card.referral_cells : parseJsonArr(card.referral_cells)
        const ps = new Set(purchased); const rs = new Set(referral)
        const count = completed.filter(idx => !ps.has(idx) && !rs.has(idx) && idx !== 12).length
        if (card.week_year === currentWy) thisWeekDeeds += count
        if (card.week_year === lastWy) lastWeekDeeds += count
      }
      const weekTrend = thisWeekDeeds - lastWeekDeeds

      // ── Country count (breadth) ───────────────────────────────────────────────
      const uniqueCountries = new Set(
        (allUsers ?? []).filter(u => u.country_id).map(u => u.country_id)
      ).size

      // ── Country flag cluster (top countries by player count) ─────────────────
      const topCountryFlags = Object.entries(playersByCountry)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([code]) => {
          const flagMap: Record<string, string> = { CA:'🍁',US:'🇺🇸',GB:'🇬🇧',AU:'🇦🇺',NZ:'🇳🇿',IE:'🇮🇪',IN:'🇮🇳',NG:'🇳🇬',ZA:'🇿🇦',PH:'🇵🇭',MX:'🇲🇽',BR:'🇧🇷',FR:'🇫🇷',DE:'🇩🇪',JP:'🇯🇵' }
          return flagMap[code] ?? '🌐'
        })

      // ── New players this week vs last week ───────────────────────────────────
      const weekStartDate = getWeekStart(currentWy)
      const lastWeekStartDate = getWeekStart(lastWy)
      const { data: allUsersWithCreated } = await supabase.from('users').select('id, created_at')
      let newPlayersThisWeek = 0
      let newPlayersLastWeek = 0
      for (const u of (allUsersWithCreated ?? [])) {
        const created = new Date(u.created_at)
        if (created >= weekStartDate) newPlayersThisWeek++
        else if (created >= lastWeekStartDate) newPlayersLastWeek++
      }

      // ── Total referrals ──────────────────────────────────────────────────────
      const totalReferrals = (allReferrals ?? []).length

      // ── Geographic drill-down tree: country → province/state → city ──────────
      // Groups players (and their all-time deeds) by location so the leaderboard
      // can drill down with plain lists — no map graphics needed.
      type CityNode = { name: string; deeds: number; players: number }
      type StateNode = { name: string; deeds: number; players: number; cities: Record<string, CityNode> }
      type CountryNode = { code: string; name: string; deeds: number; players: number; states: Record<string, StateNode> }
      // Normalize free-text province/city so variants group together
      // (e.g. "ON" -> "Ontario" via the states table, "toronto" -> "Toronto").
      const { data: statesRows } = await supabase.from('states').select('name, code')
      const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase())
      const stateCanon: Record<string, string> = {}
      for (const st of (statesRows ?? [])) {
        if (st.code) stateCanon[String(st.code).toLowerCase().trim()] = st.name
        if (st.name) stateCanon[String(st.name).toLowerCase().trim()] = st.name
      }
      const normProvince = (raw: string | null): string => {
        const t = (raw ?? '').trim()
        if (!t) return 'Unspecified'
        return stateCanon[t.toLowerCase()] ?? titleCase(t)
      }
      const normCity = (raw: string | null): string => {
        const t = (raw ?? '').trim()
        return t ? titleCase(t) : 'Unspecified'
      }
      // Sort comparator: real names by deeds desc, "Unknown"/"Unspecified" always last.
      const placeSort = (a: { name: string; deeds: number }, b: { name: string; deeds: number }) => {
        const aLast = a.name === 'Unknown' || a.name === 'Unspecified'
        const bLast = b.name === 'Unknown' || b.name === 'Unspecified'
        if (aLast !== bLast) return aLast ? 1 : -1
        return b.deeds - a.deeds
      }
      const geoMap: Record<string, CountryNode> = {}
      for (const u of (allUsers ?? [])) {
        const country = u.country_id ? countryMap[u.country_id] : null
        const cName = country?.name ?? 'Unknown'
        const cCode = country?.code ?? 'XX'
        const sName = normProvince(u.province_state)
        const cityName = normCity(u.city)
        const deeds = allTime[u.id] ?? 0
        if (!geoMap[cName]) geoMap[cName] = { code: cCode, name: cName, deeds: 0, players: 0, states: {} }
        const cn = geoMap[cName]; cn.deeds += deeds; cn.players += 1
        if (!cn.states[sName]) cn.states[sName] = { name: sName, deeds: 0, players: 0, cities: {} }
        const sn = cn.states[sName]; sn.deeds += deeds; sn.players += 1
        if (!sn.cities[cityName]) sn.cities[cityName] = { name: cityName, deeds: 0, players: 0 }
        const cityNode = sn.cities[cityName]; cityNode.deeds += deeds; cityNode.players += 1
      }
      const geoTree = Object.values(geoMap)
        .map(cn => ({
          code: cn.code, name: cn.name, deeds: cn.deeds, players: cn.players,
          states: Object.values(cn.states)
            .map(sn => ({
              name: sn.name, deeds: sn.deeds, players: sn.players,
              // Only reveal city-level detail once the province clears the threshold.
              cities: sn.players >= geoDrilldownThreshold ? Object.values(sn.cities).sort(placeSort) : [],
            }))
            .sort(placeSort),
        }))
        .sort(placeSort)

      // Full deed breakdown (every completed deed with its count), for deed drill-down
      const deedBreakdown = Object.entries(deedCounts)
        .map(([id, count]) => {
          const deed = (allDeeds ?? []).find(d => d.id === parseInt(id))
          return { deed_id: parseInt(id), deed_text: deed?.deed_text ?? '', category: deed?.category ?? '', count }
        })
        .filter(d => d.deed_text)
        .sort((a, b) => b.count - a.count)

      return jsonResponse({
        all_time: allTimeRanked,
        this_week: thisWeekRanked,
        regions_all_time: regionsAllTime,
        regions_this_week: regionsThisWeek,
        current_week_year: currentWy,
        top_deeds: topDeeds,
        promotion_threshold: promotionThreshold,
        this_week_deeds: thisWeekDeeds,
        last_week_deeds: lastWeekDeeds,
        week_trend: weekTrend,
        unique_countries: uniqueCountries,
        top_country_flags: topCountryFlags,
        new_players_this_week: newPlayersThisWeek,
        new_players_last_week: newPlayersLastWeek,
        total_referrals: totalReferrals,
        geo_tree: geoTree,
        deed_breakdown: deedBreakdown,
        geo_drilldown_threshold: geoDrilldownThreshold,
      })
    }

    // ── GET /impact/summary ───────────────────────────────────────────────────
    // Impact Board (Issue #14) Phase 2: summary metrics for a time period, read
    // from completed_deeds. period = month | quarter | year | all (life-to-date).
    // NOTE: aggregates in-JS over the period's rows — fine at current volumes;
    // move to a cached rollup / SQL aggregation when the table grows large.
    if (method === 'GET' && path === '/impact/summary') {
      const period = new URL(req.url).searchParams.get('period') ?? 'all'
      const start = impactPeriodStart(period)

      let cdQuery = supabase
        .from('completed_deeds')
        .select('player_id, team_id_at_completion, city, province_state, country_id')
        .eq('is_hidden_from_impact_board', false)
      if (start) cdQuery = cdQuery.gte('completed_at', start)
      const { data: cd } = await cdQuery
      const rows = cd ?? []

      const deedsDelivered = rows.length
      const activePlayers = new Set(rows.map(r => r.player_id)).size
      const activeTeams = new Set(rows.filter(r => r.team_id_at_completion != null).map(r => r.team_id_at_completion)).size
      const countries = new Set(rows.filter(r => r.country_id != null).map(r => r.country_id)).size
      const provinces = new Set(rows.filter(r => r.province_state).map(r => `${r.country_id}|${r.province_state}`)).size
      const cities = new Set(rows.filter(r => r.city).map(r => `${r.country_id}|${r.province_state}|${r.city}`)).size

      // Lifetime participation (all-time, ignores the period)
      const { data: allCd } = await supabase
        .from('completed_deeds').select('player_id, team_id_at_completion')
        .eq('is_hidden_from_impact_board', false)
      const lifetimePlayers = new Set((allCd ?? []).map(r => r.player_id)).size
      const lifetimeTeams = new Set((allCd ?? []).filter(r => r.team_id_at_completion != null).map(r => r.team_id_at_completion)).size

      // Bingos + full cards. completed_deeds has no bingo/full-card event yet, so
      // derive from player_cards (time-filtered by updated_at — approximate).
      const { data: cards } = await supabase
        .from('player_cards').select('completed_cells, purchased_cells, referral_cells, card_data, is_bingo, updated_at')
      let bingos = 0, fullCards = 0
      for (const c of (cards ?? [])) {
        if (start && (!c.updated_at || c.updated_at < start)) continue
        if (c.is_bingo) bingos++
        let cells: Cell[] = []
        try { cells = JSON.parse(c.card_data) } catch { cells = [] }
        const covered = new Set([
          ...parseJsonArr(c.completed_cells),
          ...parseJsonArr(c.purchased_cells),
          ...parseJsonArr(c.referral_cells),
          ...freeSpaceIndices(cells),
        ])
        if (cells.length > 0 && covered.size >= cells.length) fullCards++
      }

      return jsonResponse({
        period,
        impact: { deeds_delivered: deedsDelivered, bingos_achieved: bingos, full_cards_completed: fullCards },
        participation: { active_players: activePlayers, lifetime_players: lifetimePlayers, active_teams: activeTeams, lifetime_teams: lifetimeTeams },
        reach: { cities, provinces, countries },
      })
    }

    // ── GET /my-impact-stats ──────────────────────────────────────────────────
    // Player-facing (not community-wide): powers the "Share My Impact" card
    // customization — a period total plus a per-deed breakdown, so a player
    // can feature a specific deed ("Bought 12 Beverages this month") instead
    // of just a total. period = week | month | quarter | year | all.
    if (method === 'GET' && path === '/my-impact-stats') {
      const user = requireAuth(authUser)
      const period = url.searchParams.get('period') ?? 'week'
      const start = impactPeriodStart(period)

      // deed_id/quick_deed_id have no FK to good_deeds/quick_deeds (matches
      // completed_deeds' existing convention), so PostgREST can't embed them
      // — resolve manually, same pattern as /public/world-deeds below.
      let cdQuery = supabase
        .from('completed_deeds')
        .select('deed_id, quick_deed_id')
        .eq('player_id', user.sub)
        .eq('is_hidden_from_impact_board', false)
      if (start) cdQuery = cdQuery.gte('completed_at', start)
      const { data } = await cdQuery
      const rows = (data ?? []) as { deed_id: number | null; quick_deed_id: number | null }[]

      const deedIds = [...new Set(rows.map((r) => r.deed_id).filter((v): v is number => v != null))]
      const quickDeedIds = [...new Set(rows.map((r) => r.quick_deed_id).filter((v): v is number => v != null))]
      const [{ data: gd }, { data: qd }] = await Promise.all([
        deedIds.length ? supabase.from('good_deeds').select('id, deed_text').in('id', deedIds) : Promise.resolve({ data: [] as { id: number; deed_text: string }[] }),
        quickDeedIds.length ? supabase.from('quick_deeds').select('id, label').in('id', quickDeedIds) : Promise.resolve({ data: [] as { id: number; label: string }[] }),
      ])
      const deedTextById = new Map((gd ?? []).map((d) => [d.id, d.deed_text]))
      const quickLabelById = new Map((qd ?? []).map((d) => [d.id, d.label]))

      const counts = new Map<string, number>()
      for (const r of rows) {
        const text = (r.deed_id != null ? deedTextById.get(r.deed_id) : null) ?? (r.quick_deed_id != null ? quickLabelById.get(r.quick_deed_id) : null) ?? null
        if (!text) continue
        counts.set(text, (counts.get(text) ?? 0) + 1)
      }
      const topDeeds = Array.from(counts.entries())
        .map(([deed_text, count]) => ({ deed_text, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

      return jsonResponse({ period, total: rows.length, top_deeds: topDeeds })
    }

    // ── GET /public/countries ─────────────────────────────────────────────────
    if (method === 'GET' && path === '/public/countries') {
      const { data } = await supabase
        .from('countries')
        .select('id, name, code')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      return jsonResponse({ countries: data ?? [] })
    }

    // ── GET /public/states/:countryId ─────────────────────────────────────────
    const statesMatch = matchPath('/public/states/:countryId', path)
    if (method === 'GET' && statesMatch) {
      const countryId = parseInt(statesMatch.countryId)
      if (isNaN(countryId)) return errorResponse('Invalid country id', 400)
      const { data } = await supabase
        .from('states')
        .select('id, name, code')
        .eq('country_id', countryId)
        .order('name', { ascending: true })
      return jsonResponse({ states: data ?? [] })
    }

    // ── GET /public/world-deeds ───────────────────────────────────────────────
    // Returns deed counts grouped by country (no user data exposed).
    // Optional ?country=CA query param drills into deed breakdown for that country.
    if (method === 'GET' && path === '/public/world-deeds') {
      const countryCode = url.searchParams.get('country')

      // Fetch all mark logs (action='mark' only, not voids)
      const { data: logs } = await supabase
        .from('cell_mark_log')
        .select('card_id, cell_index, user_id')
        .eq('action', 'mark')

      if (!logs || logs.length === 0) {
        if (countryCode) return jsonResponse({ country_code: countryCode, deeds: [], total: 0 })
        return jsonResponse({ countries: [], grand_total: 0 })
      }

      // Fetch cards referenced by logs (card_data has deed info per cell index)
      const cardIds = [...new Set(logs.map((l) => l.card_id))]
      const { data: cards } = await supabase
        .from('player_cards')
        .select('id, user_id, card_data')
        .in('id', cardIds)

      const cardMap = new Map<number, { user_id: string; cells: Cell[] }>()
      for (const card of cards ?? []) {
        try {
          cardMap.set(card.id, { user_id: card.user_id, cells: JSON.parse(card.card_data) })
        } catch { /* skip malformed */ }
      }

      // Gather all user_ids from logs to look up country
      const userIds = [...new Set(logs.map((l) => l.user_id).filter(Boolean))]
      const { data: users } = await supabase
        .from('users')
        .select('id, country_id')
        .in('id', userIds)

      const userCountryMap = new Map<string, number | null>()
      for (const u of users ?? []) userCountryMap.set(u.id, u.country_id ?? null)

      // Fetch countries for code lookup
      const { data: countriesData } = await supabase
        .from('countries')
        .select('id, name, code')

      const countryById = new Map<number, { name: string; code: string }>()
      for (const c of countriesData ?? []) countryById.set(c.id, { name: c.name, code: c.code })

      // Fetch deeds for deed text lookup
      const { data: deedsData } = await supabase
        .from('good_deeds')
        .select('id, deed_text')

      const deedById = new Map<number, string>()
      for (const d of deedsData ?? []) deedById.set(d.id, d.deed_text)

      // Aggregate: for each log entry resolve country + deed
      // country_code → deed_id → count
      const byCountry = new Map<string, { name: string; deeds: Map<number, { text: string; count: number }> }>()

      for (const log of logs) {
        const card = cardMap.get(log.card_id)
        if (!card) continue
        const cell = card.cells[log.cell_index]
        if (!cell || cell.is_free_space || !cell.deed_id) continue

        const countryId = userCountryMap.get(log.user_id) ?? null
        const country = countryId ? countryById.get(countryId) : null
        const code = country?.code ?? 'XX'
        const name = country?.name ?? 'Unknown'

        if (!byCountry.has(code)) byCountry.set(code, { name, deeds: new Map() })
        const entry = byCountry.get(code)!
        const deedText = deedById.get(cell.deed_id) ?? 'Unknown deed'
        if (!entry.deeds.has(cell.deed_id)) entry.deeds.set(cell.deed_id, { text: deedText, count: 0 })
        entry.deeds.get(cell.deed_id)!.count++
      }

      if (countryCode) {
        // Drill-down: return deed breakdown for one country
        const entry = byCountry.get(countryCode.toUpperCase())
        if (!entry) return jsonResponse({ country_code: countryCode, deeds: [], total: 0 })
        const deeds = [...entry.deeds.entries()]
          .map(([id, d]) => ({ deed_id: id, deed_text: d.text, count: d.count }))
          .sort((a, b) => b.count - a.count)
        return jsonResponse({ country_code: countryCode, country_name: entry.name, deeds, total: deeds.reduce((s, d) => s + d.count, 0) })
      }

      // Summary: one row per country with total deed count
      const grand_total = logs.filter((l) => {
        const card = cardMap.get(l.card_id)
        if (!card) return false
        const cell = card.cells[l.cell_index]
        return cell && !cell.is_free_space && cell.deed_id
      }).length

      const countries = [...byCountry.entries()]
        .map(([code, entry]) => ({
          country_code: code,
          country_name: entry.name,
          total_deeds: [...entry.deeds.values()].reduce((s, d) => s + d.count, 0),
        }))
        .filter((c) => c.country_code !== 'XX')
        .sort((a, b) => b.total_deeds - a.total_deeds)

      return jsonResponse({ countries, grand_total })
    }

    // ── GET /public/recent-deeds ──────────────────────────────────────────────
    // "Happening right now" ticker on the Kindness Dashboard. No player
    // identity included — same anonymity level as /public/world-deeds and the
    // leaderboard's geo/deed breakdowns, which never expose who did what.
    if (method === 'GET' && path === '/public/recent-deeds') {
      // deed_id/quick_deed_id have no FK to good_deeds/quick_deeds — resolve
      // manually, same pattern as /public/world-deeds below.
      const { data } = await supabase
        .from('completed_deeds')
        .select('deed_id, quick_deed_id, city, country_name, completed_at')
        .eq('is_hidden_from_impact_board', false)
        .order('completed_at', { ascending: false })
        .limit(30)
      const rows = (data ?? []) as { deed_id: number | null; quick_deed_id: number | null; city: string | null; country_name: string | null; completed_at: string }[]

      const deedIds = [...new Set(rows.map((r) => r.deed_id).filter((v): v is number => v != null))]
      const quickDeedIds = [...new Set(rows.map((r) => r.quick_deed_id).filter((v): v is number => v != null))]
      const [{ data: gd }, { data: qd }] = await Promise.all([
        deedIds.length ? supabase.from('good_deeds').select('id, deed_text').in('id', deedIds) : Promise.resolve({ data: [] as { id: number; deed_text: string }[] }),
        quickDeedIds.length ? supabase.from('quick_deeds').select('id, label').in('id', quickDeedIds) : Promise.resolve({ data: [] as { id: number; label: string }[] }),
      ])
      const deedTextById = new Map((gd ?? []).map((d) => [d.id, d.deed_text]))
      const quickLabelById = new Map((qd ?? []).map((d) => [d.id, d.label]))

      const deeds = rows
        .map((r) => ({
          deed_text: (r.deed_id != null ? deedTextById.get(r.deed_id) : null) ?? (r.quick_deed_id != null ? quickLabelById.get(r.quick_deed_id) : null) ?? null,
          city: r.city,
          country_name: r.country_name,
          completed_at: r.completed_at,
        }))
        .filter((d) => d.deed_text)
      return jsonResponse({ deeds })
    }

    // ── GET /public/community-voices ──────────────────────────────────────────
    // Real answers to the card-pickup reflection prompts, admin-approved only
    // (see /admin/prompt-responses) — username shown, never a real name.
    if (method === 'GET' && path === '/public/community-voices') {
      // user_id has no FK to users — resolve manually, same pattern as
      // /public/world-deeds below.
      const { data } = await supabase
        .from('player_prompt_responses')
        .select('user_id, response_text, created_at, card_pickup_prompts(question_text)')
        .eq('is_approved_for_display', true)
        .order('created_at', { ascending: false })
        .limit(10)
      const rows = (data ?? []) as unknown as {
        user_id: string; response_text: string; created_at: string
        card_pickup_prompts: { question_text: string } | null
      }[]
      const userIds = [...new Set(rows.map((r) => r.user_id))]
      const { data: usersData } = await supabase.from('users').select('id, username').in('id', userIds)
      const usernameById = new Map((usersData ?? []).map((u) => [u.id, u.username as string | null]))
      return jsonResponse({
        voices: rows.map((r) => ({
          question_text: r.card_pickup_prompts?.question_text ?? '',
          response_text: r.response_text,
          username: usernameById.get(r.user_id) ?? null,
        })),
      })
    }

    // ── GET /public/prize ─────────────────────────────────────────────────────
    if (method === 'GET' && path === '/public/prize') {
      const { data: rows } = await supabase
        .from('game_configs').select('config_key, config_value')
        .in('config_key', ['prize_image_url', 'prize_title'])
      const cfg: Record<string, string> = {}
      for (const r of rows ?? []) cfg[r.config_key] = r.config_value ?? ''
      return jsonResponse({ prize_image_url: cfg['prize_image_url'] ?? '', prize_title: cfg['prize_title'] ?? "This Week's Prize" })
    }

    // ── GET /public/offline-status ────────────────────────────────────────────
    // Deliberately not requireAuth-gated — anonymous/logged-out visitors call
    // this too. But if a valid player token WAS sent, a player flagged
    // is_test is exempt from Offline Mode: this response just reports
    // offline_mode: false for them, so Curt can pause the app for everyone
    // else while specific testers keep playing normally. Checked live off the
    // DB (not baked into the login token), so flipping the flag takes effect
    // immediately without the tester needing to log out and back in.
    if (method === 'GET' && path === '/public/offline-status') {
      const { data } = await supabase
        .from('game_configs').select('config_key, config_value')
        .in('config_key', ['offline_mode', 'offline_until'])
      const cfg: Record<string, string> = {}
      for (const r of data ?? []) cfg[r.config_key] = r.config_value ?? ''
      let offlineMode = cfg['offline_mode'] === 'true'

      if (offlineMode && authUser?.sub) {
        const { data: testRow } = await supabase
          .from('users').select('is_test').eq('id', authUser.sub).maybeSingle()
        if (testRow?.is_test) offlineMode = false
      }

      return jsonResponse({
        offline_mode: offlineMode,
        offline_until: cfg['offline_until'] || null,
      })
    }

    // ── POST /admin/verify ────────────────────────────────────────────────────
    if (method === 'POST' && path === '/admin/verify') {
      const body = await req.json()

      const { data: lockout } = await supabase
        .from('admin_lockout').select('*').eq('id', 1).maybeSingle()

      if (lockout?.locked) {
        return errorResponse('Admin login locked. Check your email for an unlock link.', 423)
      }

      const { data: cfg } = await supabase
        .from('game_configs').select('config_value').eq('config_key', 'admin_password').maybeSingle()

      // config_value is a bcrypt hash (migration 20260711000000) — never a
      // plaintext comparison, matching every other credential in this codebase.
      const passwordValid = cfg?.config_value ? await bcrypt.compare(String(body.password ?? ''), cfg.config_value) : false
      if (!passwordValid) {
        const newCount = (lockout?.failed_attempts ?? 0) + 1

        if (newCount >= 5) {
          const tokenBytes = new Uint8Array(32)
          crypto.getRandomValues(tokenBytes)
          const unlockToken = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('')
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

          await supabase.from('admin_lockout').update({
            failed_attempts: newCount,
            locked: true,
            unlock_token: unlockToken,
            unlock_token_expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          }).eq('id', 1)

          const { data: recipients } = await supabase
            .from('admin_alert_recipients').select('email').eq('is_active', true)

          if (recipients && recipients.length > 0) {
            const unlockUrl = `https://havagr8day.com/admin/unlock?token=${unlockToken}`
            const tpl = adminLockoutEmail(unlockUrl)
            await Promise.all(recipients.map((r) => sendEmail({ to: r.email, subject: tpl.subject, html: tpl.html })))
          }
        } else {
          await supabase.from('admin_lockout').update({
            failed_attempts: newCount,
            updated_at: new Date().toISOString(),
          }).eq('id', 1)
        }

        // Same 403 whether this guess was merely wrong or the one that just
        // tripped the lock — an attacker shouldn't be able to distinguish the
        // two. 423 only fires on a *subsequent* attempt once already locked.
        return errorResponse('Invalid admin password', 403)
      }

      // Correct password — reset counter
      await supabase.from('admin_lockout').update({
        failed_attempts: 0,
        updated_at: new Date().toISOString(),
      }).eq('id', 1)

      return jsonResponse({ success: true })
    }

    // ── GET /admin/unlock ──────────────────────────────────────────────────────
    if (method === 'GET' && path === '/admin/unlock') {
      const token = url.searchParams.get('token')
      if (!token) return errorResponse('Missing token', 400)

      const { data: lockout } = await supabase
        .from('admin_lockout').select('*').eq('id', 1).maybeSingle()

      if (!lockout?.locked || lockout.unlock_token !== token) {
        return errorResponse('Link invalid or already used', 400)
      }
      if (new Date(lockout.unlock_token_expires_at) < new Date()) {
        return errorResponse('Link expired', 400)
      }

      await supabase.from('admin_lockout').update({
        locked: false,
        failed_attempts: 0,
        unlock_token: null,
        unlock_token_expires_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', 1)

      return jsonResponse({ success: true })
    }

    // ── POST /admin/request-password-reset ────────────────────────────────────
    if (method === 'POST' && path === '/admin/request-password-reset') {
      // Token creation always happens, independent of whether anyone is
      // configured to receive the email — an empty admin_alert_recipients
      // table must never suppress the underlying reset-token write.
      const tokenBytes = new Uint8Array(32)
      crypto.getRandomValues(tokenBytes)
      const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('')
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour

      await supabase.from('admin_password_reset_tokens').insert({ token, expires_at: expiresAt })

      const { data: recipients } = await supabase
        .from('admin_alert_recipients').select('email').eq('is_active', true)

      if (recipients && recipients.length > 0) {
        const resetUrl = `https://havagr8day.com/admin/reset-password?token=${token}`
        const tpl = adminPasswordResetEmail(resetUrl)
        await Promise.all(recipients.map((r) => sendEmail({ to: r.email, subject: tpl.subject, html: tpl.html })))
      }

      // Always return success — nothing meaningful to enumerate with a single admin.
      return jsonResponse({ success: true })
    }

    // ── POST /admin/reset-password ─────────────────────────────────────────────
    if (method === 'POST' && path === '/admin/reset-password') {
      const body = await req.json()
      const token = String(body.token ?? '').trim()
      const newPassword = String(body.new_password ?? '').trim()
      if (!token || !newPassword) return errorResponse('Token and new password required', 400)

      const { data: resetRow } = await supabase
        .from('admin_password_reset_tokens').select('*').eq('token', token).maybeSingle()

      if (!resetRow || resetRow.used_at || new Date(resetRow.expires_at) < new Date()) {
        return errorResponse('Link invalid or expired', 400)
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10)
      await supabase.from('game_configs')
        .update({ config_value: newPasswordHash, updated_at: new Date().toISOString() })
        .eq('config_key', 'admin_password')

      await supabase.from('admin_password_reset_tokens')
        .update({ used_at: new Date().toISOString() }).eq('id', resetRow.id)

      // Resetting the password is also a legitimate way out of a lockout.
      await supabase.from('admin_lockout').update({
        locked: false, failed_attempts: 0, unlock_token: null, unlock_token_expires_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', 1)

      return jsonResponse({ success: true })
    }

    // ── GET /admin/config ─────────────────────────────────────────────────────
    // admin_password is deliberately excluded — it's a bcrypt hash, not a
    // setting, and has its own dedicated verify/reset-password flow. Never
    // surface it through the generic settings editor.
    if (method === 'GET' && path === '/admin/config') {
      requireAdmin(authUser)
      const { data } = await supabase.from('game_configs').select('*').neq('config_key', 'admin_password')
      const configs: Record<string, { value: string; description: string }> = {}
      for (const c of data ?? []) configs[c.config_key] = { value: c.config_value ?? '', description: c.description ?? '' }
      return jsonResponse({ configs })
    }

    // ── POST /admin/config ────────────────────────────────────────────────────
    if (method === 'POST' && path === '/admin/config') {
      requireAdmin(authUser)
      const body = await req.json()
      for (const [key, value] of Object.entries(body.configs ?? {})) {
        // Never let the generic settings editor write admin_password as
        // plaintext — that's exactly the hole /admin/reset-password's bcrypt
        // hashing exists to close.
        if (key === 'admin_password') continue
        const { data: existing } = await supabase
          .from('game_configs').select('id').eq('config_key', key).maybeSingle()
        if (existing) {
          await supabase.from('game_configs')
            .update({ config_value: String(value), updated_at: new Date().toISOString() })
            .eq('config_key', key)
        } else {
          await supabase.from('game_configs').insert({
            config_key: key, config_value: String(value), description: '', updated_at: new Date().toISOString(),
          })
        }
      }
      return jsonResponse({ success: true })
    }

    // ── GET /admin/teams ──────────────────────────────────────────────────────
    if (method === 'GET' && path === '/admin/teams') {
      requireAdmin(authUser)
      const { data, error } = await supabase
        .from('teams')
        .select(`
          id, team_number, team_name, created_at,
          captain:users!captain_user_id(id, player_number, first_name, last_name, username),
          team_members(id, user_id, users(id, player_number, first_name, last_name, username))
        `)
        .order('team_number', { ascending: true })
      if (error) throw error
      return jsonResponse({ teams: data ?? [] })
    }

    // ── POST /admin/teams ─────────────────────────────────────────────────────
    if (method === 'POST' && path === '/admin/teams') {
      requireAdmin(authUser)
      const body = await req.json()
      const teamName = String(body.team_name ?? '').trim()
      if (!teamName) return errorResponse('team_name is required', 400)

      // Resolve captain by player_number if provided
      let captainUserId: string | null = null
      if (body.captain_player_number) {
        const pn = parseInt(body.captain_player_number)
        const { data: cap } = await supabase.from('users').select('id').eq('player_number', pn).maybeSingle()
        captainUserId = cap?.id ?? null
      }

      const { data: team, error } = await supabase
        .from('teams')
        .insert({ team_name: teamName, captain_user_id: captainUserId })
        .select()
        .single()
      if (error) throw error

      // Auto-add captain as a member and mark them as captain on their profile
      if (captainUserId) {
        await supabase.from('team_members')
          .upsert({ team_id: team.id, user_id: captainUserId }, { onConflict: 'user_id' })
        await supabase.from('users').update({ captain_team_id: team.id }).eq('id', captainUserId)
      }

      return jsonResponse({ success: true, team })
    }

    // ── PUT /admin/teams/:id ──────────────────────────────────────────────────
    const teamEditMatch = matchPath('/admin/teams/:id', path)
    if (method === 'PUT' && teamEditMatch) {
      requireAdmin(authUser)
      const teamId = parseInt(teamEditMatch.id)
      const body = await req.json()
      const teamName = body.team_name != null ? String(body.team_name).trim() : undefined

      let captainUserId: string | null | undefined = undefined
      if (body.captain_player_number !== undefined) {
        if (!body.captain_player_number) {
          captainUserId = null
        } else {
          const pn = parseInt(body.captain_player_number)
          const { data: cap } = await supabase.from('users').select('id').eq('player_number', pn).maybeSingle()
          captainUserId = cap?.id ?? null
        }
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (teamName !== undefined) updates.team_name = teamName
      if (captainUserId !== undefined) {
        // Clear captain_team_id from the old captain first
        await supabase.from('users').update({ captain_team_id: null }).eq('captain_team_id', teamId)
        updates.captain_user_id = captainUserId
        if (captainUserId) {
          await supabase.from('team_members')
            .upsert({ team_id: teamId, user_id: captainUserId }, { onConflict: 'user_id' })
          await supabase.from('users').update({ captain_team_id: teamId }).eq('id', captainUserId)
        }
      }

      await supabase.from('teams').update(updates).eq('id', teamId)
      return jsonResponse({ success: true })
    }

    // ── DELETE /admin/teams/:id ───────────────────────────────────────────────
    const teamDeleteMatch = matchPath('/admin/teams/:id', path)
    if (method === 'DELETE' && teamDeleteMatch) {
      requireAdmin(authUser)
      const teamId = parseInt(teamDeleteMatch.id)
      // Clear captain_team_id from the captain before deleting
      await supabase.from('users').update({ captain_team_id: null }).eq('captain_team_id', teamId)
      await supabase.from('teams').delete().eq('id', teamId)
      return jsonResponse({ success: true })
    }

    // ── POST /admin/teams/:id/members ─────────────────────────────────────────
    const teamMemberMatch = matchPath('/admin/teams/:id/members', path)
    if (method === 'POST' && teamMemberMatch) {
      requireAdmin(authUser)
      const teamId = parseInt(teamMemberMatch.id)
      const body = await req.json()
      const pn = parseInt(body.player_number)
      if (isNaN(pn)) return errorResponse('player_number is required', 400)

      const { data: player } = await supabase.from('users').select('id').eq('player_number', pn).maybeSingle()
      if (!player) return errorResponse(`No player found with number ${pn}`, 404)

      // Check team size limit
      const { count } = await supabase.from('team_members')
        .select('id', { count: 'exact', head: true }).eq('team_id', teamId)
      if ((count ?? 0) >= 4) return errorResponse('Teams are limited to 4 players.', 400)

      // Check player isn't already on a team
      const { data: existing } = await supabase.from('team_members')
        .select('team_id').eq('user_id', player.id).maybeSingle()
      if (existing) return errorResponse('This player is already on a team.', 400)

      await supabase.from('team_members').insert({ team_id: teamId, user_id: player.id })
      return jsonResponse({ success: true })
    }

    // ── DELETE /admin/teams/:id/members/:userId ───────────────────────────────
    const teamMemberDeleteMatch = matchPath('/admin/teams/:id/members/:userId', path)
    if (method === 'DELETE' && teamMemberDeleteMatch) {
      requireAdmin(authUser)
      const teamId = parseInt(teamMemberDeleteMatch.id)
      const userId = teamMemberDeleteMatch.userId
      await supabase.from('team_members').delete().eq('team_id', teamId).eq('user_id', userId)
      return jsonResponse({ success: true })
    }

    // ── GET /admin/player-card?player_number=X  OR  ?last_name=Smith ────────
    if (method === 'GET' && path === '/admin/player-card') {
      requireAdmin(authUser)
      const params = new URL(req.url).searchParams
      const pnStr = params.get('player_number')
      const lastNameQ = params.get('last_name')?.trim()

      // Search by last name: return a list of matches (no card data)
      if (lastNameQ) {
        const { data: matches } = await supabase
          .from('users')
          .select('id, first_name, last_name, username, email, player_number')
          .ilike('last_name', `%${lastNameQ}%`)
          .order('last_name', { ascending: true })
          .limit(20)
        return jsonResponse({ matches: (matches ?? []).map((u) => ({
          id: u.id,
          player_number: u.player_number,
          display_name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || `GR8-${u.player_number}`,
          email: u.email,
        })) })
      }

      if (!pnStr) return errorResponse('player_number or last_name is required', 400)
      const pn = parseInt(pnStr)
      if (isNaN(pn)) return errorResponse('player_number must be a number', 400)

      const { data: targetUser } = await supabase
        .from('users')
        .select('id, first_name, last_name, username, email, player_number, current_streak_days, longest_streak_days, last_valid_deed_date')
        .eq('player_number', pn)
        .maybeSingle()
      if (!targetUser) return errorResponse('Player not found', 404)

      const weekYear = getCurrentWeekYear()
      const { data: card } = await supabase
        .from('player_cards')
        .select('*')
        .eq('user_id', targetUser.id)
        .eq('week_year', weekYear)
        .maybeSingle()

      return jsonResponse({
        player: {
          id: targetUser.id,
          player_number: targetUser.player_number,
          display_name: [targetUser.first_name, targetUser.last_name].filter(Boolean).join(' ') || targetUser.username || `GR8-${targetUser.player_number}`,
          email: targetUser.email,
          current_streak_days: targetUser.current_streak_days ?? 0,
          longest_streak_days: targetUser.longest_streak_days ?? 0,
          last_valid_deed_date: targetUser.last_valid_deed_date ?? null,
        },
        card: card ? {
          card_id: card.id,
          week_year: card.week_year,
          cells: sanitizeCells(JSON.parse(card.card_data), parseJsonArr(card.completed_cells)),
          win_condition: card.win_condition,
          completed_cells: parseJsonArr(card.completed_cells),
          purchased_cells: parseJsonArr(card.purchased_cells),
          referral_cells: parseJsonArr(card.referral_cells),
          is_bingo: card.is_bingo,
        } : null,
      })
    }

    // ── GET /admin/members ────────────────────────────────────────────────────
    if (method === 'GET' && path === '/admin/members') {
      requireAdmin(authUser)
      const { data } = await supabase
        .from('users')
        .select('id, email, username, name, first_name, last_name, role, province_state, country, city, country_id, state_id, player_number, last_login, profile_completed, email_verified, is_trusted, is_test')
        .order('player_number', { ascending: true })
      return jsonResponse({
        members: (data ?? []).map((u) => ({
          id: u.id,
          name: u.name ?? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim(),
          first_name: u.first_name ?? null,
          last_name: u.last_name ?? null,
          username: u.username ?? null,
          email: u.email ?? null,
          role: u.role ?? 'user',
          province_state: u.province_state ?? null,
          country: u.country ?? null,
          city: u.city ?? null,
          country_id: u.country_id ?? null,
          state_id: u.state_id ?? null,
          player_number: u.player_number ?? null,
          last_login: u.last_login ?? null,
          profile_completed: !!u.profile_completed,
          email_verified: !!u.email_verified,
          is_trusted: !!u.is_trusted,
          is_test: !!u.is_test,
        })),
      })
    }

    // ── GET /admin/deeds ──────────────────────────────────────────────────────
    if (method === 'GET' && path === '/admin/deeds') {
      requireAdmin(authUser)
      const { data } = await supabase.from('good_deeds').select('*').order('id')
      return jsonResponse({
        deeds: (data ?? []).map((d) => ({
          id: d.id, deed_text: d.deed_text, deed_text_long: d.deed_text_long ?? null,
          category: d.category, is_active: d.is_active, complexity: d.complexity ?? null,
          quantity: d.quantity ?? 1, quick_tap_eligible: d.quick_tap_eligible ?? false,
          quick_tap_default: d.quick_tap_default ?? false, quick_tap_label: d.quick_tap_label ?? null,
          status: d.status ?? 'Draft',
        })),
      })
    }

    // ── POST /admin/deeds ─────────────────────────────────────────────────────
    if (method === 'POST' && path === '/admin/deeds') {
      requireAdmin(authUser)
      const body = await req.json()
      const VALID_STATUSES = ['Draft', 'Review', 'Approved', 'Retired']
      if (!String(body.category ?? '').trim()) return errorResponse('A category is required', 400)
      const quickTapEligible = body.quick_tap_eligible === true
      const quickTapLabel = body.quick_tap_label != null ? String(body.quick_tap_label).trim() : ''
      if (quickTapLabel.length > 36) return errorResponse('Quick Tap label must be 36 characters or fewer', 400)
      if (quickTapEligible && !quickTapLabel) return errorResponse('Quick Tap label is required when Quick Tap eligible is on', 400)
      const { data, error } = await supabase.from('good_deeds').insert({
        deed_text: body.deed_text ?? '',
        deed_text_long: body.deed_text_long || null,
        category: body.category,
        is_active: body.is_active ?? true,
        complexity: body.complexity != null ? Number(body.complexity) : null,
        quantity: body.quantity != null ? Math.max(1, Math.round(Number(body.quantity)) || 1) : 1,
        quick_tap_eligible: quickTapEligible,
        quick_tap_default: body.quick_tap_default === true,
        quick_tap_label: quickTapLabel || null,
        status: VALID_STATUSES.includes(body.status) ? body.status : 'Draft',
      }).select().single()
      if (error) {
        const friendly = friendlyDeedCategoryError(error)
        if (friendly) return errorResponse(friendly, 400)
        throw error
      }
      return jsonResponse({ id: data.id, deed_text: data.deed_text, deed_text_long: data.deed_text_long, category: data.category, is_active: data.is_active, complexity: data.complexity ?? null, quantity: data.quantity ?? 1, quick_tap_eligible: data.quick_tap_eligible ?? false, quick_tap_default: data.quick_tap_default ?? false, quick_tap_label: data.quick_tap_label ?? null, status: data.status ?? 'Draft' })
    }

    // ── POST /admin/deeds/bulk-status ─────────────────────────────────────────
    // Bulk-update the workflow status of multiple deeds at once (e.g. approving
    // a whole reviewed batch, or bulk-retiring a category), separate from the
    // single-deed PUT below.
    if (method === 'POST' && path === '/admin/deeds/bulk-status') {
      requireAdmin(authUser)
      const body = await req.json()
      const VALID_STATUSES = ['Draft', 'Review', 'Approved', 'Retired']
      const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number).filter((n: number) => Number.isFinite(n) && n > 0) : []
      const status = String(body.status ?? '')
      if (ids.length === 0) return errorResponse('At least one deed id is required', 400)
      if (!VALID_STATUSES.includes(status)) return errorResponse('status must be one of Draft, Review, Approved, Retired', 400)
      const { error } = await supabase.from('good_deeds').update({ status }).in('id', ids)
      if (error) throw error
      return jsonResponse({ success: true, updated: ids.length })
    }

    // ── POST /admin/deeds/import ──────────────────────────────────────────────
    if (method === 'POST' && path === '/admin/deeds/import') {
      requireAdmin(authUser)
      const body = await req.json()
      const rows: Array<Record<string, unknown>> = body.deeds ?? []
      let updated = 0, created = 0, skipped = 0
      const warnings: string[] = []

      // Build a lookup of existing deeds by lowercased text so an upload with a
      // blank id matches an existing deed by NAME instead of creating a duplicate.
      const { data: allDeeds } = await supabase.from('good_deeds').select('id, deed_text')
      const idByText = new Map<string, number>()
      for (const d of allDeeds ?? []) {
        idByText.set(String(d.deed_text ?? '').trim().toLowerCase(), d.id)
      }

      // Strict boolean parsing: only the literal "true" (any case) is truthy.
      const parseStrictBool = (v: unknown): boolean =>
        String(v ?? '').trim().toLowerCase() === 'true'

      // Clamp quantity to the allowed 1–4 range; default to 1.
      const parseQuantity = (v: unknown): number => {
        const n = Number(v)
        if (!Number.isFinite(n)) return 1
        return Math.max(1, Math.round(n))
      }

      // Build targeting lookup if any targeting_* columns are present.
      const targetingKeys = Object.keys(rows[0] ?? {}).filter((k) => k.startsWith('targeting_'))
      type AttrInfo = { labels: Map<string, number> }
      const attrBySlug = new Map<string, AttrInfo>()
      if (targetingKeys.length > 0) {
        const { data: attrs } = await supabase.from('targeting_attributes').select('id, name').eq('is_active', true)
        const { data: vals } = await supabase.from('targeting_values').select('id, attribute_id, label').eq('is_active', true)
        const valsByAttr = new Map<number, typeof vals>()
        for (const v of vals ?? []) {
          if (!valsByAttr.has(v.attribute_id)) valsByAttr.set(v.attribute_id, [])
          valsByAttr.get(v.attribute_id)!.push(v)
        }
        for (const attr of attrs ?? []) {
          const slug = 'targeting_' + attr.name.toLowerCase().replace(/\s+/g, '_')
          const labelMap = new Map<string, number>()
          for (const v of valsByAttr.get(attr.id) ?? []) {
            labelMap.set(String(v.label).toLowerCase(), v.id)
          }
          attrBySlug.set(slug, { labels: labelMap })
        }
        for (const key of targetingKeys) {
          if (!attrBySlug.has(key)) warnings.push(`Unknown targeting column "${key}" — ignored`)
        }
      }

      const validStatuses = new Set(['Draft', 'Review', 'Approved', 'Retired'])

      // Every real category name, so a bad/misspelled category can be reported
      // by name instead of just failing the insert with an opaque DB error.
      const validCategories = new Set((await supabase.from('deed_categories').select('name')).data?.map((c) => c.name) ?? [])

      for (const row of rows) {
        const text = String(row.deed_text ?? '').trim()
        if (!text) { skipped++; continue }

        // good_deeds.category is NOT NULL with a foreign key into
        // deed_categories (migration 20260709000002) — every deed must have
        // a real category. Reject the row explicitly here, by name, rather
        // than letting it fail the insert/update below with a generic error.
        const categoryVal = row.category ? String(row.category).trim() : ''
        if (!categoryVal) { skipped++; warnings.push(`Row "${text}" skipped — category is required`); continue }
        if (!validCategories.has(categoryVal)) { skipped++; warnings.push(`Row "${text}" skipped — unknown category "${categoryVal}"`); continue }

        const complexityVal = (row.complexity != null && String(row.complexity).trim() !== '')
          ? (Number(row.complexity) || null)
          : null
        // Blank/invalid status: leave existing rows untouched, default new rows to Draft.
        const statusRaw = row.status != null ? String(row.status).trim() : ''
        const statusVal = validStatuses.has(statusRaw) ? statusRaw : null

        const quickTapEligibleVal = parseStrictBool(row.quick_tap_eligible)
        const quickTapLabelVal = row.quick_tap_label ? String(row.quick_tap_label).trim() : ''
        if (quickTapLabelVal.length > 36) { skipped++; warnings.push(`Row "${text}" skipped — quick_tap_label must be 36 characters or fewer`); continue }
        if (quickTapEligibleVal && !quickTapLabelVal) { skipped++; warnings.push(`Row "${text}" skipped — quick_tap_label is required when quick_tap_eligible is true`); continue }

        const payload: Record<string, unknown> = {
          deed_text: text,
          deed_text_long: row.deed_text_long ? String(row.deed_text_long).trim() || null : null,
          category: categoryVal,
          complexity: complexityVal,
          quantity: parseQuantity(row.quantity),
          is_active: parseStrictBool(row.is_active),
          quick_tap_eligible: quickTapEligibleVal,
          quick_tap_default: parseStrictBool(row.quick_tap_default),
          quick_tap_label: quickTapLabelVal || null,
        }

        // Determine the target row: explicit id wins, else match by name.
        const explicitId = row.id ? Number(row.id) : 0
        const matchedId = explicitId > 0 ? explicitId : (idByText.get(text.toLowerCase()) ?? 0)

        let resolvedId = matchedId
        if (matchedId > 0) {
          if (statusVal) payload.status = statusVal
          const { error } = await supabase.from('good_deeds').update(payload).eq('id', matchedId)
          if (!error) updated++; else { skipped++; continue }
        } else {
          payload.status = statusVal ?? 'Draft'
          const { data: inserted, error } = await supabase.from('good_deeds').insert(payload).select('id').single()
          if (!error && inserted) {
            created++
            resolvedId = inserted.id
            idByText.set(text.toLowerCase(), inserted.id)
          } else {
            skipped++; continue
          }
        }

        // Write targeting if columns were present in the CSV.
        if (targetingKeys.length > 0 && resolvedId > 0) {
          const valueIds: number[] = []
          for (const key of targetingKeys) {
            const attrInfo = attrBySlug.get(key)
            if (!attrInfo) continue
            const raw = String(row[key] ?? '').trim()
            if (!raw) continue
            for (const label of raw.split('|').map((l: string) => l.trim()).filter(Boolean)) {
              const valueId = attrInfo.labels.get(label.toLowerCase())
              if (valueId == null) {
                warnings.push(`Row "${text}": ${key} has unknown value "${label}"`)
              } else {
                valueIds.push(valueId)
              }
            }
          }
          // Scope the delete to only value_ids that belong to attributes present in this CSV.
          // Attributes not included as columns are left completely untouched.
          const presentAttrValueIds: number[] = []
          for (const key of targetingKeys) {
            const attrInfo = attrBySlug.get(key)
            if (attrInfo) for (const vId of attrInfo.labels.values()) presentAttrValueIds.push(vId)
          }
          if (presentAttrValueIds.length > 0) {
            await supabase.from('deed_targeting_values').delete()
              .eq('deed_id', resolvedId)
              .in('targeting_value_id', presentAttrValueIds)
          }
          if (valueIds.length > 0) {
            await supabase.from('deed_targeting_values').insert(valueIds.map((v) => ({ deed_id: resolvedId, targeting_value_id: v })))
          }
        }
      }
      return jsonResponse({ success: true, updated, created, skipped, total: updated + created, warnings })
    }

    // ── GET /admin/deeds/targeting-bulk ──────────────────────────────────────
    if (method === 'GET' && path === '/admin/deeds/targeting-bulk') {
      requireAdmin(authUser)
      const { data } = await supabase.from('deed_targeting_values').select('deed_id, targeting_value_id')
      return jsonResponse({ rows: data ?? [] })
    }

    // ── GET /admin/targeting-attributes ──────────────────────────────────────
    if (method === 'GET' && path === '/admin/targeting-attributes') {
      requireAdmin(authUser)
      const { data: attrs } = await supabase
        .from('targeting_attributes').select('id, name, display_order')
        .eq('is_active', true).order('display_order')
      const { data: vals } = await supabase
        .from('targeting_values').select('id, attribute_id, label, description, is_default, display_order')
        .eq('is_active', true).order('display_order')
      const valsByAttr = new Map<number, typeof vals>()
      for (const v of vals ?? []) {
        if (!valsByAttr.has(v.attribute_id)) valsByAttr.set(v.attribute_id, [])
        valsByAttr.get(v.attribute_id)!.push(v)
      }
      const attributes = (attrs ?? []).map((a) => ({
        id: a.id, name: a.name, display_order: a.display_order,
        values: valsByAttr.get(a.id) ?? [],
      }))
      return jsonResponse({ attributes })
    }

    // ── GET + PUT /admin/deeds/:id/targeting (must be before /:id PUT/DELETE) ─
    const deedTargetingMatch = path.match(/^\/admin\/deeds\/(\d+)\/targeting$/)
    if (method === 'GET' && deedTargetingMatch) {
      requireAdmin(authUser)
      const deedId = parseInt(deedTargetingMatch[1])
      const { data } = await supabase
        .from('deed_targeting_values').select('targeting_value_id').eq('deed_id', deedId)
      return jsonResponse({ targeting_value_ids: (data ?? []).map((r) => Number(r.targeting_value_id)) })
    }
    if (method === 'PUT' && deedTargetingMatch) {
      requireAdmin(authUser)
      const deedId = parseInt(deedTargetingMatch[1])
      const body = await req.json()
      const ids: number[] = (body.targeting_value_ids ?? []).map(Number).filter((n: number) => Number.isFinite(n) && n > 0)
      await supabase.from('deed_targeting_values').delete().eq('deed_id', deedId)
      if (ids.length > 0) {
        const rows = ids.map((v) => ({ deed_id: deedId, targeting_value_id: v }))
        const { error } = await supabase.from('deed_targeting_values').insert(rows)
        if (error) throw error
      }
      return jsonResponse({ success: true })
    }

    // ── PUT /admin/deeds/:id ──────────────────────────────────────────────────
    const deedPutMatch = matchPath('/admin/deeds/:id', path)
    if (method === 'PUT' && deedPutMatch) {
      requireAdmin(authUser)
      const body = await req.json()
      const updates: Record<string, unknown> = {}
      if ('deed_text' in body) updates.deed_text = body.deed_text
      if ('deed_text_long' in body) updates.deed_text_long = body.deed_text_long || null
      if ('category' in body) {
        if (!String(body.category ?? '').trim()) return errorResponse('A category is required', 400)
        updates.category = body.category
      }
      if ('is_active' in body) updates.is_active = body.is_active
      if ('complexity' in body) updates.complexity = body.complexity != null ? Number(body.complexity) : null
      if ('quantity' in body) updates.quantity = body.quantity != null ? Math.max(1, Math.round(Number(body.quantity)) || 1) : 1
      if ('quick_tap_eligible' in body) updates.quick_tap_eligible = body.quick_tap_eligible === true
      if ('quick_tap_default' in body) updates.quick_tap_default = body.quick_tap_default === true
      if ('quick_tap_label' in body) {
        const label = body.quick_tap_label != null ? String(body.quick_tap_label).trim() : ''
        if (label.length > 36) return errorResponse('Quick Tap label must be 36 characters or fewer', 400)
        updates.quick_tap_label = label || null
      }
      if ('status' in body && ['Draft', 'Review', 'Approved', 'Retired'].includes(body.status)) updates.status = body.status

      // Validate the RESULTING state, not just what's in this PUT body — a
      // toggle-only PUT (no label field) against a deed that's still
      // label-less must be rejected too, same as a label-only PUT that would
      // leave quick_tap_eligible=true with an empty label.
      if ('quick_tap_eligible' in updates || 'quick_tap_label' in updates) {
        const { data: existing } = await supabase.from('good_deeds')
          .select('quick_tap_eligible, quick_tap_label').eq('id', parseInt(deedPutMatch.id)).maybeSingle()
        const effectiveEligible = 'quick_tap_eligible' in updates ? updates.quick_tap_eligible === true : (existing?.quick_tap_eligible ?? false)
        const effectiveLabel = 'quick_tap_label' in updates ? updates.quick_tap_label : (existing?.quick_tap_label ?? null)
        if (effectiveEligible && !effectiveLabel) return errorResponse('Quick Tap label is required when Quick Tap eligible is on', 400)
      }

      const { data, error } = await supabase.from('good_deeds')
        .update(updates).eq('id', parseInt(deedPutMatch.id)).select().maybeSingle()
      if (error) {
        const friendly = friendlyDeedCategoryError(error)
        if (friendly) return errorResponse(friendly, 400)
        throw error
      }
      if (!data) return errorResponse('Deed not found', 404)
      return jsonResponse({ id: data.id, deed_text: data.deed_text, deed_text_long: data.deed_text_long, category: data.category, is_active: data.is_active, complexity: data.complexity ?? null, quantity: data.quantity ?? 1, quick_tap_eligible: data.quick_tap_eligible ?? false, quick_tap_default: data.quick_tap_default ?? false, quick_tap_label: data.quick_tap_label ?? null, status: data.status ?? 'Draft' })
    }

    // ── DELETE /admin/deeds/:id ───────────────────────────────────────────────
    const deedDeleteMatch = matchPath('/admin/deeds/:id', path)
    if (method === 'DELETE' && deedDeleteMatch) {
      requireAdmin(authUser)
      const { error } = await supabase.from('good_deeds').delete().eq('id', parseInt(deedDeleteMatch.id))
      if (error) throw error
      return jsonResponse({ success: true })
    }

    // ── POST /suggest-deed ────────────────────────────────────────────────────
    if (method === 'POST' && path === '/suggest-deed') {
      const user = requireAuth(authUser)
      const body = await req.json()
      const text = String(body.deed_text ?? '').trim()
      if (!text) return errorResponse('Deed text is required', 400)
      if (text.length > 500) return errorResponse('Deed text is too long (max 500 chars)', 400)
      const suggesterName = user.name ?? user.email ?? 'Anonymous'
      const { data, error } = await supabase.from('pending_deeds').insert({
        deed_text: text,
        category: String(body.category ?? '').trim() || null,
        notes: String(body.notes ?? '').trim() || null,
        suggested_by_user_id: user.sub,
        suggested_by_name: suggesterName,
        status: 'pending',
      }).select().single()
      if (error) throw error
      return jsonResponse({ success: true, message: 'Thanks! Your deed suggestion was submitted and is awaiting admin approval.', id: data.id })
    }

    // ── GET /my-prize-history ─────────────────────────────────────────────────
    if (method === 'GET' && path === '/my-prize-history') {
      const user = requireAuth(authUser)

      // All winning cards for this player
      const { data: winningCards } = await supabase
        .from('player_cards')
        .select('id, week_year, win_condition, updated_at')
        .eq('user_id', user.sub)
        .eq('is_bingo', true)
        .order('week_year', { ascending: false })

      // All prize claims for this player
      const { data: claims } = await supabase
        .from('prize_claims')
        .select('id, week_year, status, full_name, email, created_at')
        .eq('user_id', user.sub)
        .order('created_at', { ascending: false })

      const claimsByWeek: Record<string, NonNullable<typeof claims>[number]> = {}
      for (const c of (claims ?? [])) claimsByWeek[c.week_year] = c

      const history = (winningCards ?? []).map((card) => ({
        week_year: card.week_year,
        win_condition: card.win_condition,
        won_at: card.updated_at,
        claim: claimsByWeek[card.week_year] ?? null,
      }))

      return jsonResponse({ history })
    }

    // ── GET /my-suggestions ───────────────────────────────────────────────────
    if (method === 'GET' && path === '/my-suggestions') {
      const user = requireAuth(authUser)
      const { data } = await supabase.from('pending_deeds').select('*')
        .eq('suggested_by_user_id', user.sub)
        .order('created_at', { ascending: false })
      return jsonResponse({
        suggestions: (data ?? []).map((p) => ({
          id: p.id, deed_text: p.deed_text, category: p.category, notes: p.notes,
          status: p.status, created_at: p.created_at,
        })),
      })
    }

    // ── GET /admin/pending-deeds ──────────────────────────────────────────────
    if (method === 'GET' && path === '/admin/pending-deeds') {
      requireAdmin(authUser)
      const statusFilter = url.searchParams.get('status') ?? 'pending'
      let query = supabase.from('pending_deeds').select('*')
      if (statusFilter !== 'all') query = query.eq('status', statusFilter)
      const { data } = await query.order('created_at', { ascending: false })
      return jsonResponse({
        pending_deeds: (data ?? []).map((p) => ({
          id: p.id, deed_text: p.deed_text, category: p.category, notes: p.notes,
          suggested_by_name: p.suggested_by_name, status: p.status, created_at: p.created_at,
        })),
      })
    }

    // ── POST /admin/pending-deeds/:id/approve ─────────────────────────────────
    const approveMatch = matchPath('/admin/pending-deeds/:id/approve', path)
    if (method === 'POST' && approveMatch) {
      requireAdmin(authUser)
      const { data: pending } = await supabase.from('pending_deeds')
        .select('*').eq('id', parseInt(approveMatch.id)).maybeSingle()
      if (!pending) return errorResponse('Pending deed not found', 404)
      if (pending.status === 'approved') return errorResponse('Already approved', 400)
      const { data: newDeed, error } = await supabase.from('good_deeds').insert({
        deed_text: pending.deed_text, deed_text_long: null,
        category: pending.category ?? 'Community', is_active: true, status: 'Approved',
      }).select().single()
      if (error) throw error
      await supabase.from('pending_deeds').update({ status: 'approved' }).eq('id', pending.id)
      return jsonResponse({ success: true, message: 'Deed approved and added to the active pool.', deed: { id: newDeed.id, deed_text: newDeed.deed_text, deed_text_long: null, category: newDeed.category, is_active: true } })
    }

    // ── POST /admin/pending-deeds/:id/reject ──────────────────────────────────
    const rejectMatch = matchPath('/admin/pending-deeds/:id/reject', path)
    if (method === 'POST' && rejectMatch) {
      requireAdmin(authUser)
      const { data: pending } = await supabase.from('pending_deeds')
        .select('id, status').eq('id', parseInt(rejectMatch.id)).maybeSingle()
      if (!pending) return errorResponse('Pending deed not found', 404)
      if (pending.status === 'rejected') return errorResponse('Already rejected', 400)
      await supabase.from('pending_deeds').update({ status: 'rejected' }).eq('id', pending.id)
      return jsonResponse({ success: true, message: 'Deed suggestion rejected.' })
    }

    // ── DELETE /admin/pending-deeds/:id ───────────────────────────────────────
    const pendingDeleteMatch = matchPath('/admin/pending-deeds/:id', path)
    if (method === 'DELETE' && pendingDeleteMatch) {
      requireAdmin(authUser)
      const { data: pending } = await supabase.from('pending_deeds')
        .select('id').eq('id', parseInt(pendingDeleteMatch.id)).maybeSingle()
      if (!pending) return errorResponse('Pending deed not found', 404)
      await supabase.from('pending_deeds').delete().eq('id', pending.id)
      return jsonResponse({ success: true })
    }

    // ── POST /unmark-cell ─────────────────────────────────────────────────────
    if (method === 'POST' && path === '/unmark-cell') {
      const user = requireAuth(authUser)
      const body = await req.json()
      const { card_id, cell_index } = body

      const { data: card } = await supabase
        .from('player_cards').select('*')
        .eq('id', card_id).eq('user_id', user.sub).maybeSingle()
      if (!card) return errorResponse('Card not found', 404)

      const cells: Cell[] = JSON.parse(card.card_data)
      const cell = cells[cell_index]
      if (cell.is_purchasable) return errorResponse('Purchased squares cannot be unmarked', 400)
      if (cell.is_referral_free) return errorResponse('Referral squares cannot be unmarked', 400)
      if (cell.is_free_space) return errorResponse('Free squares cannot be unmarked', 400)
      if (cell.is_secret && cell.secret_revealed) {
        return errorResponse('Secret squares that already awarded a reward cannot be unmarked', 400)
      }

      const completed = parseJsonArr(card.completed_cells)
      if (!completed.includes(cell_index)) return errorResponse('Cell is not marked', 400)

      const updatedCompleted = completed.filter((i) => i !== cell_index)
      const purchased = parseJsonArr(card.purchased_cells)
      const referral = parseJsonArr(card.referral_cells)
      const allCompleted = [...new Set([...updatedCompleted, ...purchased, ...referral, ...freeSpaceIndices(cells)])]
      const isBingo = checkBingo(allCompleted, card.win_condition)

      await supabase.from('player_cards').update({
        completed_cells: JSON.stringify(updatedCompleted),
        is_bingo: isBingo,
        updated_at: new Date().toISOString(),
      }).eq('id', card_id)

      return jsonResponse({ success: true, completed_cells: updatedCompleted, is_bingo: isBingo })
    }

    // ── POST /admin/announce-game ─────────────────────────────────────────────
    if (method === 'POST' && path === '/admin/announce-game') {
      requireAdmin(authUser)
      const body = await req.json()
      const { prize, game_type, theme, extra_message } = body as {
        prize: string
        game_type: string
        theme: string
        extra_message?: string
      }
      if (!prize || !game_type) {
        return errorResponse('prize and game_type are required', 400)
      }

      // If the admin left "Additional Message" blank, offer to have Claude
      // write one from the prize/game type/theme — purely a nice-to-have
      // flourish, so any failure (no key, bad response) just falls back to
      // no extra message rather than blocking the send.
      let effectiveExtraMessage = extra_message
      if (!effectiveExtraMessage?.trim()) {
        const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
        if (anthropicKey) {
          try {
            const { data: promptCfg } = await supabase
              .from('game_configs').select('config_value').eq('config_key', 'game_announcement_prompt_template').maybeSingle()
            const template = promptCfg?.config_value?.trim() || DEFAULT_ANNOUNCE_PROMPT_TEMPLATE
            const prompt = template
              .replaceAll('{{PRIZE}}', prize)
              .replaceAll('{{GAME_TYPE}}', game_type)
              .replaceAll('{{THEME}}', theme || 'none set this week')

            const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'claude-sonnet-5',
                max_tokens: 300,
                messages: [{ role: 'user', content: prompt }],
              }),
            })
            if (claudeResp.ok) {
              const claudeJson = await claudeResp.json()
              const text: string = claudeJson?.content?.[0]?.text ?? ''
              if (text.trim()) effectiveExtraMessage = text.trim()
            } else {
              console.error('[announce-game] Claude API call failed', claudeResp.status, await claudeResp.text().catch(() => ''))
            }
          } catch (err) {
            console.error('[announce-game] AI extra-message generation failed', err)
          }
        }
      }

      const { data: players, error: playersErr } = await supabase
        .from('users')
        .select('email, first_name, name, username')
        .eq('email_verified', true)
        .eq('role', 'user')

      if (playersErr) throw playersErr
      if (!players || players.length === 0) {
        return jsonResponse({ success: true, sent: 0, failed: 0, message: 'No players to notify.' })
      }

      let sent = 0
      let failed = 0
      for (const player of players) {
        const displayName = player.first_name ?? player.name ?? player.username ?? null
        const tpl = gameAnnouncementEmail({ name: displayName, prize, gameType: game_type, theme, extraMessage: effectiveExtraMessage })
        const result = await sendEmail({ to: player.email, subject: tpl.subject, html: tpl.html })
        if (result.sent) sent++
        else failed++
      }

      return jsonResponse({ success: true, sent, failed, ai_generated_extra_message: effectiveExtraMessage !== extra_message })
    }

    // ── POST /admin/void-cell ─────────────────────────────────────────────────
    if (method === 'POST' && path === '/admin/void-cell') {
      requireAdmin(authUser)
      const body = await req.json()
      const { card_id, cell_index, reason } = body
      if (card_id == null || cell_index == null) return errorResponse('card_id and cell_index are required', 400)
      const voidReason = reason ? String(reason).trim().slice(0, 500) : null

      const { data: card } = await supabase
        .from('player_cards').select('*').eq('id', card_id).maybeSingle()
      if (!card) return errorResponse('Card not found', 404)

      const cells: Cell[] = JSON.parse(card.card_data)
      const completed = parseJsonArr(card.completed_cells)
      if (!completed.includes(cell_index)) return errorResponse('Cell is not marked', 400)

      const updatedCompleted = completed.filter((i: number) => i !== cell_index)
      const purchased = parseJsonArr(card.purchased_cells)
      const referral = parseJsonArr(card.referral_cells)
      const allCompleted = [...new Set([...updatedCompleted, ...purchased, ...referral, ...freeSpaceIndices(cells)])]
      const isBingo = checkBingo(allCompleted, card.win_condition)

      await supabase.from('player_cards').update({
        completed_cells: JSON.stringify(updatedCompleted),
        is_bingo: isBingo,
        updated_at: new Date().toISOString(),
      }).eq('id', card_id)

      await supabase.from('cell_mark_log').insert({
        user_id: card.user_id,
        card_id,
        cell_index,
        action: 'void',
        voided_by: authUser!.sub,
        void_reason: voidReason,
      })

      return jsonResponse({ success: true, completed_cells: updatedCompleted, is_bingo: isBingo })
    }

    // ── GET /admin/cell-mark-log ──────────────────────────────────────────────
    if (method === 'GET' && path === '/admin/cell-mark-log') {
      requireAdmin(authUser)
      const limitParam = parseInt(url.searchParams.get('limit') ?? '100')
      const limit = Math.min(Math.max(1, limitParam), 500)
      const { data, error } = await supabase
        .from('cell_mark_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      // cell_mark_log.user_id has no FK to users, so PostgREST can't embed it.
      // Look up the usernames/emails in a second query and attach them.
      const logRows = data ?? []
      const ids = [...new Set(logRows.map((l) => l.user_id).filter(Boolean))]
      const userMap = new Map<string, { username: string | null; email: string | null }>()
      if (ids.length > 0) {
        const { data: us } = await supabase
          .from('users').select('id, username, email').in('id', ids)
        for (const u of us ?? []) userMap.set(u.id, { username: u.username ?? null, email: u.email ?? null })
      }
      const logs = logRows.map((l) => ({ ...l, users: userMap.get(l.user_id) ?? null }))
      return jsonResponse({ logs })
    }

    // ── POST /wallet/create-payment-intent ───────────────────────────────────
    if (method === 'POST' && path === '/wallet/create-payment-intent') {
      const user = requireAuth(authUser)
      const body = await req.json()
      const amount = Number(body.amount)
      if (!amount || amount <= 0 || amount > 200) return errorResponse('Invalid amount', 400)

      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
      if (!stripeKey || stripeKey === 'FILL_IN_FROM_STRIPE_DASHBOARD') {
        return errorResponse('Payment processing is not yet configured. Please contact support.', 503)
      }

      // Create Stripe PaymentIntent
      const params = new URLSearchParams({
        amount: String(Math.round(amount * 100)), // cents
        currency: 'cad',
        'metadata[user_id]': user.sub,
        'metadata[wallet_amount]': String(amount),
        'automatic_payment_methods[enabled]': 'true',
      })

      const stripeResp = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      })

      const paymentIntent = await stripeResp.json() as { id?: string; client_secret?: string; error?: { message: string } }
      if (paymentIntent.error) return errorResponse(paymentIntent.error.message, 400)

      return jsonResponse({ client_secret: paymentIntent.client_secret })
    }

    // ── POST /wallet/confirm-payment ──────────────────────────────────────────
    if (method === 'POST' && path === '/wallet/confirm-payment') {
      const user = requireAuth(authUser)
      const body = await req.json()
      const { payment_intent_id } = body
      if (!payment_intent_id) return errorResponse('payment_intent_id is required', 400)

      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
      if (!stripeKey || stripeKey === 'FILL_IN_FROM_STRIPE_DASHBOARD') {
        return errorResponse('Payment processing not configured', 503)
      }

      // Retrieve and verify the payment intent from Stripe
      const stripeResp = await fetch(`https://api.stripe.com/v1/payment_intents/${payment_intent_id}`, {
        headers: { 'Authorization': `Bearer ${stripeKey}` },
      })
      const pi = await stripeResp.json() as { status?: string; metadata?: { user_id?: string; wallet_amount?: string }; error?: { message: string } }

      if (pi.error) return errorResponse(pi.error.message, 400)
      if (pi.status !== 'succeeded') return errorResponse('Payment not completed', 400)
      if (pi.metadata?.user_id !== user.sub) return errorResponse('Payment does not belong to this account', 403)

      const walletAmount = parseFloat(pi.metadata?.wallet_amount ?? '0')
      if (!walletAmount || walletAmount <= 0) return errorResponse('Invalid wallet amount', 400)

      // Idempotency: if this payment was already credited, don't credit again.
      // Return the current balance so the UI still updates correctly.
      const { data: existingTxn } = await supabase
        .from('wallet_transactions').select('id')
        .eq('payment_intent_id', payment_intent_id).maybeSingle()

      let { data: wallet } = await supabase
        .from('player_wallets').select('*').eq('user_id', user.sub).maybeSingle()
      if (!wallet) {
        const { data: w } = await supabase
          .from('player_wallets').insert({ user_id: user.sub, balance: 0 }).select().single()
        wallet = w
      }

      if (existingTxn) {
        return jsonResponse({ success: true, new_balance: parseFloat(wallet.balance), already_credited: true })
      }

      // Record the transaction FIRST with the payment_intent_id. The unique index
      // on payment_intent_id guarantees a concurrent duplicate insert fails, so the
      // wallet can never be credited twice for the same payment.
      const { error: txnError } = await supabase.from('wallet_transactions').insert({
        user_id: user.sub,
        amount: walletAmount,
        transaction_type: 'deposit',
        item_description: `Added ${walletAmount.toFixed(2)} Gr8Day Bucks to wallet`,
        payment_intent_id,
      })
      if (txnError) {
        // Likely a duplicate (unique violation) from a concurrent request — already credited.
        return jsonResponse({ success: true, new_balance: parseFloat(wallet.balance), already_credited: true })
      }

      const newBalance = parseFloat(wallet.balance) + walletAmount
      await supabase.from('player_wallets')
        .update({ balance: newBalance, updated_at: new Date().toISOString() }).eq('user_id', user.sub)

      return jsonResponse({ success: true, new_balance: newBalance })
    }

    // ── POST /request-password-reset ─────────────────────────────────────────
    if (method === 'POST' && path === '/request-password-reset') {
      const body = await req.json()
      const email = String(body.email ?? '').trim().toLowerCase()
      if (!email) return errorResponse('Email is required', 400)

      // Look up user by email in the users table (custom auth lives here)
      const { data: userRow } = await supabase
        .from('users').select('id, email').eq('email', email).maybeSingle()

      if (userRow) {
        // Generate secure random token
        const tokenBytes = new Uint8Array(32)
        crypto.getRandomValues(tokenBytes)
        const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('')
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour

        await supabase.from('password_reset_tokens').insert({
          user_id: userRow.id,
          token,
          expires_at: expiresAt,
        })

        const resetUrl = `https://havagr8day.com/reset-password?token=${token}`
        const tpl = passwordResetEmail(resetUrl)
        await sendEmail({ to: email, subject: tpl.subject, html: tpl.html })
      }

      // Always return success to prevent email enumeration
      return jsonResponse({ success: true })
    }

    // ── POST /reset-password ──────────────────────────────────────────────────
    if (method === 'POST' && path === '/reset-password') {
      const body = await req.json()
      const token = String(body.token ?? '').trim()
      const newPassword = String(body.new_password ?? '').trim()

      if (!token || !newPassword) return errorResponse('Token and new password are required', 400)
      if (newPassword.length < 8) return errorResponse('Password must be at least 8 characters', 400)

      const { data: tokenRow } = await supabase
        .from('password_reset_tokens').select('*')
        .eq('token', token).maybeSingle()

      if (!tokenRow) return errorResponse('Invalid or expired reset link', 400)
      if (tokenRow.used_at) return errorResponse('This reset link has already been used', 400)
      if (new Date(tokenRow.expires_at) < new Date()) return errorResponse('Reset link has expired. Please request a new one.', 400)

      // Reject reusing the current password as the new password.
      const { data: existingUser } = await supabase
        .from('users').select('password_hash').eq('id', tokenRow.user_id).maybeSingle()
      if (existingUser?.password_hash) {
        const sameAsOld = await bcrypt.compare(newPassword, existingUser.password_hash)
        if (sameAsOld) {
          return errorResponse('Your new password must be different from your current password.', 400)
        }
      }

      // Hash the new password with bcrypt to match the login check (auth-custom uses bcrypt).
      const passwordHash = await bcrypt.hash(newPassword, 10)

      const { data: updated, error: updErr } = await supabase
        .from('users').update({ password_hash: passwordHash }).eq('id', tokenRow.user_id).select('id').maybeSingle()
      if (updErr || !updated) return errorResponse('Could not update password. Please try again.', 400)

      await supabase.from('password_reset_tokens').update({ used_at: new Date().toISOString() }).eq('id', tokenRow.id)

      return jsonResponse({ success: true, message: 'Password updated successfully' })
    }

    // ── POST /claim-prize ─────────────────────────────────────────────────────
    if (method === 'POST' && path === '/claim-prize') {
      const user = requireAuth(authUser)

      // Anonymous accounts (Issue #17) have no contact info, so they are not
      // eligible for prizes. Enforced server-side.
      const { data: claimant } = await supabase
        .from('users').select('registration_type').eq('id', user.sub).maybeSingle()
      if (claimant?.registration_type === 'anonymous') {
        return errorResponse(
          'Anonymous accounts are not eligible for prizes because we have no way to contact you.',
          403,
        )
      }

      const body = await req.json()
      const { full_name, email, phone, mailing_address, notes } = body

      if (!full_name || !email) return errorResponse('Name and email are required', 400)

      const weekYear = getCurrentWeekYear()

      // Verify player actually won this week
      const { data: card } = await supabase
        .from('player_cards').select('is_bingo, week_year')
        .eq('user_id', user.sub).eq('week_year', weekYear).maybeSingle()
      if (!card || !card.is_bingo) return errorResponse('No winning card found for this week', 400)

      // Prevent duplicate claims
      const { data: existing } = await supabase
        .from('prize_claims').select('id').eq('user_id', user.sub).eq('week_year', weekYear).maybeSingle()
      if (existing) return errorResponse('You have already submitted a claim for this week', 400)

      const { error } = await supabase.from('prize_claims').insert({
        user_id: user.sub,
        week_year: weekYear,
        full_name: String(full_name).trim(),
        email: String(email).trim().toLowerCase(),
        phone: phone ? String(phone).trim() : null,
        mailing_address: mailing_address ? String(mailing_address).trim() : null,
        notes: notes ? String(notes).trim() : null,
        status: 'pending',
      })
      if (error) throw error

      // Confirmation email to the claimant (best-effort).
      const claimantEmail = String(email).trim().toLowerCase()
      if (claimantEmail) {
        const tpl = prizeClaimConfirmationEmail(String(full_name).trim() || null)
        await sendEmail({ to: claimantEmail, subject: tpl.subject, html: tpl.html })
      }

      return jsonResponse({ success: true, message: 'Prize claim submitted! We will contact you within 48 hours.' })
    }

    // ── GET /admin/prize-claims ───────────────────────────────────────────────
    if (method === 'GET' && path === '/admin/prize-claims') {
      requireAdmin(authUser)
      const { data } = await supabase
        .from('prize_claims').select('*').order('created_at', { ascending: false })
      return jsonResponse({
        claims: (data ?? []).map((c) => ({
          id: c.id,
          user_id: c.user_id,
          week_year: c.week_year,
          full_name: c.full_name,
          email: c.email,
          phone: c.phone ?? null,
          mailing_address: c.mailing_address ?? null,
          notes: c.notes ?? null,
          status: c.status,
          created_at: c.created_at,
        })),
      })
    }

    // ── PUT /admin/prize-claims/:id ───────────────────────────────────────────
    const claimMatch = matchPath('/admin/prize-claims/:id', path)
    if (method === 'PUT' && claimMatch) {
      requireAdmin(authUser)
      const body = await req.json()
      const { status } = body
      if (!['pending', 'contacted', 'fulfilled', 'rejected'].includes(status)) {
        return errorResponse('Invalid status', 400)
      }
      const claimId = parseInt(claimMatch.id)
      const { data: existingClaim } = await supabase
        .from('prize_claims').select('full_name, email, status').eq('id', claimId).maybeSingle()
      const { error } = await supabase.from('prize_claims')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', claimId)
      if (error) throw error

      // Email the voucher code the moment a claim newly becomes "fulfilled" —
      // never on re-saving an already-fulfilled claim, and best-effort so a
      // send failure never breaks the status update itself.
      if (status === 'fulfilled' && existingClaim && existingClaim.status !== 'fulfilled' && existingClaim.email) {
        try {
          const { data: cfgRows } = await supabase
            .from('game_configs').select('config_key, config_value')
            .in('config_key', ['prize_title', 'prize_voucher_code', 'prize_image_url'])
          const cfg: Record<string, string> = {}
          for (const r of cfgRows ?? []) cfg[r.config_key] = r.config_value ?? ''
          if (cfg['prize_voucher_code']) {
            const tpl = prizeVoucherEmail(existingClaim.full_name ?? null, cfg['prize_title'] ?? null, cfg['prize_voucher_code'], cfg['prize_image_url'] ?? null)
            await sendEmail({ to: existingClaim.email, subject: tpl.subject, html: tpl.html })
          }
        } catch (err) {
          console.error('[prize-voucher-email] failed to send', err)
        }
      }

      return jsonResponse({ success: true })
    }

    // ── GET /admin/draw-results ───────────────────────────────────────────────
    if (method === 'GET' && path === '/admin/draw-results') {
      requireAdmin(authUser)
      // total_pool_entries / winning_active_entries / eligible_players are
      // written directly onto draw_winners by runWeeklyDraw at selection time
      // — the legacy draw_entries table nothing writes to anymore is gone
      // from this query entirely (it previously always reported 0 entries).
      const { data: winners } = await supabase
        .from('draw_winners')
        .select('id, user_id, week_year, selected_at, odds_weight, winning_active_entries, total_pool_entries, eligible_players, users!inner(first_name, name, username, email)')
        .order('selected_at', { ascending: false })
        .limit(20)
      return jsonResponse({
        winners: (winners ?? []).map((w: any) => ({
          id: w.id,
          user_id: w.user_id,
          week_year: w.week_year,
          selected_at: w.selected_at,
          odds_weight: w.odds_weight,
          name: w.users?.first_name ?? w.users?.name ?? w.users?.username ?? null,
          email: w.users?.email ?? null,
          winning_active_entries: w.winning_active_entries,
          total_pool_entries: w.total_pool_entries,
          eligible_players: w.eligible_players,
        })),
      })
    }

    // ── GET /admin/draw-leaderboard ───────────────────────────────────────────
    // Per-player draw-entry data for the admin leaderboard (individual only).
    if (method === 'GET' && path === '/admin/draw-leaderboard') {
      requireAdmin(authUser)
      const wy = getCurrentWeekYear()
      const ds = await getDrawSettings(supabase)

      const { data: balances } = await supabase
        .from('player_draw_balances')
        .select('player_id, active_entries, lifetime_entries, this_week_entries, this_week_year, last_draw_win_date, last_participation_date')
      const { data: ppl } = await supabase
        .from('users').select('id, first_name, last_name, username, player_number')

      // Who participated (completed a deed) in the current week → eligibility flag.
      const wkStart = getWeekStart(wy)
      const wkEnd = new Date(wkStart); wkEnd.setDate(wkStart.getDate() + 7)
      const { data: weekDeeds } = await supabase
        .from('completed_deeds').select('player_id')
        .gte('completed_at', wkStart.toISOString()).lt('completed_at', wkEnd.toISOString())
      const participated = new Set((weekDeeds ?? []).map((d: any) => d.player_id))

      const nameById: Record<string, any> = {}
      for (const u of (ppl ?? [])) nameById[u.id] = u

      const rows = (balances ?? []).map((b: any) => {
        const u = nameById[b.player_id] ?? {}
        const thisWeek = b.this_week_year === wy ? Number(b.this_week_entries) : 0
        const active = Number(b.active_entries)
        const eligible = active > 0 && (!ds.requireParticipation || participated.has(b.player_id))
        return {
          user_id: b.player_id,
          player_name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || `GR8-${u.player_number}`,
          this_week_entries: thisWeek,
          active_entries: active,
          lifetime_entries: Number(b.lifetime_entries),
          last_draw_win: b.last_draw_win_date,
          last_participation_date: b.last_participation_date,
          current_week_eligible: eligible,
        }
      }).sort((a: any, b: any) => b.active_entries - a.active_entries)

      return jsonResponse({ week_year: wy, require_participation: ds.requireParticipation, players: rows })
    }

    // ── GET /admin/completed-deeds?player_id=X ────────────────────────────────
    // Recent completed-deed history for one player, with enough context
    // (display text, whether it's already reversed) to drive the admin
    // reverse-deed UI. is_hidden_from_impact_board doubles as "already
    // reversed" — /admin/reverse-deed sets it true when it reverses a deed.
    if (method === 'GET' && path === '/admin/completed-deeds') {
      requireAdmin(authUser)
      const playerId = url.searchParams.get('player_id')
      if (!playerId) return errorResponse('player_id is required', 400)

      const { data: deeds } = await supabase
        .from('completed_deeds')
        .select('id, source_type, deed_id, quick_deed_id, category, completed_at, is_hidden_from_impact_board')
        .eq('player_id', playerId)
        .order('completed_at', { ascending: false })
        .limit(50)

      const deedIds = [...new Set((deeds ?? []).map((d) => d.deed_id).filter((id): id is number => id != null))]
      const quickDeedIds = [...new Set((deeds ?? []).map((d) => d.quick_deed_id).filter((id): id is number => id != null))]

      const { data: goodDeeds } = deedIds.length > 0
        ? await supabase.from('good_deeds').select('id, deed_text').in('id', deedIds)
        : { data: [] as { id: number; deed_text: string }[] }
      const { data: quickDeeds } = quickDeedIds.length > 0
        ? await supabase.from('quick_deeds').select('id, label').in('id', quickDeedIds)
        : { data: [] as { id: number; label: string }[] }

      const textByDeed = new Map((goodDeeds ?? []).map((d) => [d.id, d.deed_text]))
      const textByQuick = new Map((quickDeeds ?? []).map((d) => [d.id, d.label]))

      return jsonResponse({
        deeds: (deeds ?? []).map((d) => ({
          id: d.id,
          deed_text: d.deed_id != null ? (textByDeed.get(d.deed_id) ?? 'Unknown deed')
            : d.quick_deed_id != null ? (textByQuick.get(d.quick_deed_id) ?? 'Unknown quick deed')
            : 'Unknown deed',
          source_type: d.source_type,
          category: d.category,
          completed_at: d.completed_at,
          reversed: !!d.is_hidden_from_impact_board,
        })),
      })
    }

    // ── POST /admin/reverse-deed ──────────────────────────────────────────────
    // Reverse a completed deed: remove its draw entry and, if reversing it also
    // un-completes the card's bingo, remove the related bingo bonus too.
    if (method === 'POST' && path === '/admin/reverse-deed') {
      const admin = requireAdmin(authUser)
      const body = await req.json()
      const completedDeedId = Number(body.completed_deed_id)
      const reason: string = (body.reason ? String(body.reason) : 'Deed reversed by admin').slice(0, 500)
      if (!Number.isFinite(completedDeedId)) return errorResponse('completed_deed_id required', 400)

      const { data: deed } = await supabase
        .from('completed_deeds').select('*').eq('id', completedDeedId).maybeSingle()
      if (!deed) return errorResponse('Completed deed not found', 404)

      // Remove the deed's draw entry (idempotent).
      const deedReversed = await reverseDeedEntry(supabase, completedDeedId, admin.sub, reason)

      // If this deed sat on a bingo card, recompute which lines are still
      // complete once this cell is removed. Any line that was previously
      // paid but is no longer complete gets its bonus reversed individually
      // — a card can have multiple independently-paid lines now, not just
      // one card-level bonus.
      let bingoReversed = false
      if (deed.source_type === 'bingo_card' && deed.card_id != null) {
        const { data: card } = await supabase
          .from('player_cards').select('*').eq('id', deed.card_id).maybeSingle()
        if (card) {
          const cells: Cell[] = JSON.parse(card.card_data)
          const completed = parseJsonArr(card.completed_cells).filter((i: number) => i !== deed.cell_index)
          const purchased = parseJsonArr(card.purchased_cells)
          const referral = parseJsonArr(card.referral_cells)
          const allCompleted = [...new Set([...completed, ...purchased, ...referral, ...freeSpaceIndices(cells)])]
          const stillBingo = checkBingo(allCompleted, card.win_condition)

          const stillCompleteLines = new Set(completedLineIndices(allCompleted))
          const previouslyAwardedLines: number[] = Array.isArray(card.bonus_lines_awarded) ? card.bonus_lines_awarded : []
          const linesToReverse = previouslyAwardedLines.filter((i) => !stillCompleteLines.has(i))
          const remainingAwardedLines = previouslyAwardedLines.filter((i) => stillCompleteLines.has(i))

          // Reflect the removal on the card itself.
          await supabase.from('player_cards').update({
            completed_cells: JSON.stringify(completed),
            is_bingo: stillBingo,
            bonus_lines_awarded: JSON.stringify(remainingAwardedLines),
            updated_at: new Date().toISOString(),
          }).eq('id', card.id)

          for (const lineIndex of linesToReverse) {
            const reversed = await reverseBingoBonus(supabase, card.id, card.week_year, card.play_cycle ?? 0, lineIndex, admin.sub, reason)
            if (reversed) bingoReversed = true
          }
        }
      }

      // Hide the deed from the Impact Board so rollups stay correct.
      await supabase.from('completed_deeds')
        .update({ is_hidden_from_impact_board: true }).eq('id', completedDeedId)

      return jsonResponse({ success: true, deed_entry_reversed: deedReversed, bingo_bonus_reversed: bingoReversed })
    }

    // ── POST /admin/draw-adjust ───────────────────────────────────────────────
    // Manual admin adjustment of a player's active draw entries (+/-).
    if (method === 'POST' && path === '/admin/draw-adjust') {
      const admin = requireAdmin(authUser)
      const body = await req.json()
      const playerId = String(body.player_id ?? '')
      const amount = Number(body.amount)
      const reason: string = (body.reason ? String(body.reason) : 'Manual admin adjustment').slice(0, 500)
      if (!playerId || !Number.isFinite(amount)) return errorResponse('player_id and numeric amount required', 400)
      const ok = await manualAdjust(supabase, playerId, admin.sub, Math.trunc(amount), reason)
      return jsonResponse({ success: ok })
    }

    // ── POST /admin/run-draw ──────────────────────────────────────────────────
    // Manually trigger the weekly draw for a given (or the previous) week.
    if (method === 'POST' && path === '/admin/run-draw') {
      requireAdmin(authUser)
      const body = await req.json().catch(() => ({}))
      let weekYear: string = body.week_year ? String(body.week_year) : ''
      if (!weekYear) {
        // Default to the week that just ended.
        const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        const t = new Date(d); t.setDate(d.getDate() + (4 - (d.getDay() || 7)))
        const y = t.getFullYear(); const j = new Date(y, 0, 1)
        const w = Math.ceil(((t.getTime() - j.getTime()) / 86_400_000 + 1) / 7)
        weekYear = `${y}-W${String(w).padStart(2, '0')}`
      }
      const result = await runWeeklyDraw(supabase, weekYear)
      return jsonResponse({ success: true, draw: result })
    }

    // ── GET /my-team ─────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/my-team') {
      const user = requireAuth(authUser)
      const weekYear = getCurrentWeekYear()

      // Find the team this player belongs to
      const { data: memberRow } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', user.sub)
        .maybeSingle()

      if (!memberRow) return jsonResponse({ team: null })

      // Get team info + all members
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .select(`
          id, team_number, team_name,
          captain:users!captain_user_id(id, player_number, first_name, last_name, username),
          team_members(
            id, user_id,
            users(id, player_number, first_name, last_name, username)
          )
        `)
        .eq('id', memberRow.team_id)
        .single()
      if (teamError) throw teamError

      // Fetch current-week card for each member
      const memberUserIds = (team.team_members ?? []).map((m: any) => m.user_id)
      const { data: cards } = await supabase
        .from('player_cards')
        .select('id, user_id, week_year, card_data, win_condition, completed_cells, purchased_cells, referral_cells, is_bingo')
        .eq('week_year', weekYear)
        .in('user_id', memberUserIds)

      const cardsByUser: Record<string, any> = {}
      for (const c of (cards ?? [])) {
        const completed = parseJsonArr(c.completed_cells)
        const referral = parseJsonArr(c.referral_cells)
        cardsByUser[c.user_id] = {
          card_id: c.id,
          week_year: c.week_year,
          cells: sanitizeCells(JSON.parse(c.card_data), completed),
          win_condition: c.win_condition,
          completed_cells: completed,
          purchased_cells: parseJsonArr(c.purchased_cells),
          referral_cells: referral,
          is_bingo: c.is_bingo,
        }
      }

      const members = (team.team_members ?? []).map((m: any) => ({
        user_id: m.user_id,
        player_number: m.users?.player_number ?? null,
        first_name: m.users?.first_name ?? null,
        last_name: m.users?.last_name ?? null,
        username: m.users?.username ?? null,
        card: cardsByUser[m.user_id] ?? null,
      }))

      return jsonResponse({
        team: {
          id: team.id,
          team_number: team.team_number,
          team_name: team.team_name,
          captain: team.captain,
          members,
          week_year: weekYear,
        },
      })
    }

    // ── GET /my-team/trades ───────────────────────────────────────────────────
    if (method === 'GET' && path === '/my-team/trades') {
      const user = requireAuth(authUser)
      const weekYear = getCurrentWeekYear()

      const { data: trades, error: tradesErr } = await supabase
        .from('square_trades')
        .select('*')
        .or(`from_user_id.eq.${user.sub},to_user_id.eq.${user.sub}`)
        .eq('week_year', weekYear)
        .order('created_at', { ascending: false })
      if (tradesErr) throw tradesErr

      // Collect unique user IDs to join
      const userIds = new Set<string>()
      for (const t of trades ?? []) {
        userIds.add(t.from_user_id)
        userIds.add(t.to_user_id)
      }
      const { data: userRows } = await supabase
        .from('users')
        .select('id, first_name, last_name, player_number')
        .in('id', [...userIds])
      const usersById: Record<string, { first_name: string | null; last_name: string | null; player_number: number | null }> = {}
      for (const u of userRows ?? []) usersById[u.id] = { first_name: u.first_name, last_name: u.last_name, player_number: u.player_number }

      const enriched = (trades ?? []).map((t) => ({
        ...t,
        from_user: usersById[t.from_user_id] ?? null,
        to_user: usersById[t.to_user_id] ?? null,
      }))

      return jsonResponse({ trades: enriched })
    }

    // ── POST /my-team/trades (create offer) ───────────────────────────────────
    if (method === 'POST' && path === '/my-team/trades') {
      const user = requireAuth(authUser)
      const body = await req.json()
      const { to_user_id, from_cell_index, to_cell_index } = body
      if (!to_user_id || from_cell_index == null || to_cell_index == null) {
        return errorResponse('to_user_id, from_cell_index, and to_cell_index are required', 400)
      }
      if (to_user_id === user.sub) return errorResponse('You cannot trade with yourself', 400)

      const weekYear = getCurrentWeekYear()

      // Check user is on a team
      const { data: fromMember } = await supabase
        .from('team_members').select('team_id').eq('user_id', user.sub).maybeSingle()
      if (!fromMember) return errorResponse('You are not on a team', 400)

      // Check to_user is on the same team
      const { data: toMember } = await supabase
        .from('team_members').select('team_id').eq('user_id', to_user_id).maybeSingle()
      if (!toMember || toMember.team_id !== fromMember.team_id) {
        return errorResponse('That player is not on your team', 400)
      }

      // Check no active pending outgoing trade this week
      const { data: existingPending } = await supabase
        .from('square_trades')
        .select('id')
        .eq('from_user_id', user.sub)
        .eq('week_year', weekYear)
        .eq('status', 'pending')
        .maybeSingle()
      if (existingPending) return errorResponse('You already have an active pending trade offer this week', 400)

      // Count completed trades for user this week (accepted, either from or to)
      const { count: completedCount } = await supabase
        .from('square_trades')
        .select('id', { count: 'exact', head: true })
        .eq('week_year', weekYear)
        .eq('status', 'accepted')
        .or(`from_user_id.eq.${user.sub},to_user_id.eq.${user.sub}`)
      if ((completedCount ?? 0) >= 1) return errorResponse('Trade limit reached for this week', 400)

      // Load from_card
      const { data: fromCard } = await supabase
        .from('player_cards').select('*').eq('user_id', user.sub).eq('week_year', weekYear).maybeSingle()
      if (!fromCard) return errorResponse('You do not have a card this week', 400)

      // Load to_card
      const { data: toCard } = await supabase
        .from('player_cards').select('*').eq('user_id', to_user_id).eq('week_year', weekYear).maybeSingle()
      if (!toCard) return errorResponse('That player does not have a card this week', 400)
      if (fromCard.game_mode === 'blackout' || toCard.game_mode === 'blackout') {
        return errorResponse('Not available in Blackout mode', 400)
      }

      const fromCells: Cell[] = JSON.parse(fromCard.card_data)
      const toCells: Cell[] = JSON.parse(toCard.card_data)

      const fromCell = fromCells[from_cell_index]
      const toCell = toCells[to_cell_index]

      if (!fromCell) return errorResponse('Invalid from_cell_index', 400)
      if (!toCell) return errorResponse('Invalid to_cell_index', 400)

      // Validate from_cell
      const fromCompleted = parseJsonArr(fromCard.completed_cells)
      const fromPurchased = parseJsonArr(fromCard.purchased_cells)
      const fromReferral = parseJsonArr(fromCard.referral_cells)
      if (fromCell.is_free_space) return errorResponse('Cannot trade a free space', 400)
      if (fromPurchased.includes(from_cell_index)) return errorResponse('Cannot trade a purchased square', 400)
      if (fromReferral.includes(from_cell_index)) return errorResponse('Cannot trade a referral square', 400)
      if (fromCompleted.includes(from_cell_index)) return errorResponse('Cannot trade a completed square', 400)

      // Validate to_cell
      const toCompleted = parseJsonArr(toCard.completed_cells)
      const toPurchased = parseJsonArr(toCard.purchased_cells)
      const toReferral = parseJsonArr(toCard.referral_cells)
      if (toCell.is_free_space) return errorResponse('Cannot trade a free space', 400)
      if (toPurchased.includes(to_cell_index)) return errorResponse('Cannot trade a purchased square', 400)
      if (toReferral.includes(to_cell_index)) return errorResponse('Cannot trade a referral square', 400)
      if (toCompleted.includes(to_cell_index)) return errorResponse('Cannot trade a completed square', 400)

      const { data: trade, error: tradeErr } = await supabase
        .from('square_trades')
        .insert({
          week_year: weekYear,
          from_user_id: user.sub,
          to_user_id,
          from_card_id: fromCard.id,
          to_card_id: toCard.id,
          from_cell_index,
          to_cell_index,
          from_deed_text: fromCell.deed_text,
          to_deed_text: toCell.deed_text,
          from_deed_id: fromCell.deed_id ?? null,
          to_deed_id: toCell.deed_id ?? null,
          status: 'pending',
        })
        .select()
        .single()
      if (tradeErr) throw tradeErr

      return jsonResponse({ success: true, trade })
    }

    // ── POST /my-team/trades/:id/accept ───────────────────────────────────────
    const tradeAcceptMatch = path.match(/^\/my-team\/trades\/(\d+)\/accept$/)
    if (method === 'POST' && tradeAcceptMatch) {
      const user = requireAuth(authUser)
      const tradeId = parseInt(tradeAcceptMatch[1])

      const { data: trade } = await supabase
        .from('square_trades').select('*').eq('id', tradeId).maybeSingle()
      if (!trade) return errorResponse('Trade not found', 404)
      if (trade.to_user_id !== user.sub) return errorResponse('Only the recipient can accept this trade', 403)
      if (trade.status !== 'pending') return errorResponse('Trade is no longer pending', 400)

      const expiresAt = new Date(trade.created_at).getTime() + 48 * 60 * 60 * 1000
      if (Date.now() > expiresAt) {
        await supabase.from('square_trades').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', tradeId)
        return errorResponse('Trade offer has expired', 400)
      }

      // Load both cards
      const { data: fromCard } = await supabase
        .from('player_cards').select('*').eq('id', trade.from_card_id).maybeSingle()
      const { data: toCard } = await supabase
        .from('player_cards').select('*').eq('id', trade.to_card_id).maybeSingle()
      if (!fromCard || !toCard) return errorResponse('One or both cards not found', 404)

      // Re-validate cells are still uncompleted
      const fromCompleted = parseJsonArr(fromCard.completed_cells)
      const toCompleted = parseJsonArr(toCard.completed_cells)
      if (fromCompleted.includes(trade.from_cell_index)) {
        return errorResponse('The offerer\'s square has already been completed', 400)
      }
      if (toCompleted.includes(trade.to_cell_index)) {
        return errorResponse('Your square has already been completed', 400)
      }

      // Execute swap in JS
      const fromCells: Cell[] = JSON.parse(fromCard.card_data)
      const toCells: Cell[] = JSON.parse(toCard.card_data)

      const fromCell = { ...fromCells[trade.from_cell_index] }
      const toCell = { ...toCells[trade.to_cell_index] }

      // Swap deed_text and deed_id, keep index and other flags
      fromCells[trade.from_cell_index] = {
        ...fromCell,
        deed_text: toCell.deed_text,
        deed_id: toCell.deed_id,
        deed_text_long: toCell.deed_text_long ?? null,
        quantity: toCell.quantity ?? 1,
      }
      toCells[trade.to_cell_index] = {
        ...toCell,
        deed_text: fromCell.deed_text,
        deed_id: fromCell.deed_id,
        deed_text_long: fromCell.deed_text_long ?? null,
        quantity: fromCell.quantity ?? 1,
      }

      // Update both player_cards
      await supabase.from('player_cards')
        .update({ card_data: JSON.stringify(fromCells), updated_at: new Date().toISOString() })
        .eq('id', fromCard.id)
      await supabase.from('player_cards')
        .update({ card_data: JSON.stringify(toCells), updated_at: new Date().toISOString() })
        .eq('id', toCard.id)

      // Update trade status
      await supabase.from('square_trades')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', tradeId)

      return jsonResponse({ success: true })
    }

    // ── POST /my-team/trades/:id/reject ───────────────────────────────────────
    const tradeRejectMatch = path.match(/^\/my-team\/trades\/(\d+)\/reject$/)
    if (method === 'POST' && tradeRejectMatch) {
      const user = requireAuth(authUser)
      const tradeId = parseInt(tradeRejectMatch[1])

      const { data: trade } = await supabase
        .from('square_trades').select('*').eq('id', tradeId).maybeSingle()
      if (!trade) return errorResponse('Trade not found', 404)
      if (trade.from_user_id !== user.sub && trade.to_user_id !== user.sub) {
        return errorResponse('You are not part of this trade', 403)
      }
      if (trade.status !== 'pending') return errorResponse('Trade is no longer pending', 400)

      const newStatus = trade.from_user_id === user.sub ? 'cancelled' : 'rejected'
      await supabase.from('square_trades')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', tradeId)

      return jsonResponse({ success: true })
    }

    // ── GET /my-profile ───────────────────────────────────────────────────────
    if (method === 'GET' && path === '/my-profile') {
      const user = requireAuth(authUser)

      // Fetch all cards for this user
      const { data: cards } = await supabase
        .from('player_cards')
        .select('completed_cells, purchased_cells, referral_cells')
        .eq('user_id', user.sub)

      let totalDeeds = 0
      for (const card of (cards ?? [])) {
        const completed: number[] = Array.isArray(card.completed_cells) ? card.completed_cells : parseJsonArr(card.completed_cells)
        const purchased: number[] = Array.isArray(card.purchased_cells) ? card.purchased_cells : parseJsonArr(card.purchased_cells)
        const referral: number[] = Array.isArray(card.referral_cells) ? card.referral_cells : parseJsonArr(card.referral_cells)
        const purchasedSet = new Set(purchased)
        const referralSet = new Set(referral)
        for (const idx of completed) {
          // Exclude purchased cells, referral cells, and free space (index 12)
          if (!purchasedSet.has(idx) && !referralSet.has(idx) && idx !== 12) {
            totalDeeds++
          }
        }
      }

      const badge = getBadge(totalDeeds)

      // Pull captain_team_id directly from the user record
      const { data: userRecord } = await supabase
        .from('users')
        .select('captain_team_id')
        .eq('id', user.sub)
        .maybeSingle()

      const captainTeamId = userRecord?.captain_team_id ?? null
      let captainTeamName: string | null = null
      if (captainTeamId) {
        const { data: t } = await supabase.from('teams').select('team_name').eq('id', captainTeamId).maybeSingle()
        captainTeamName = t?.team_name ?? null
      }

      return jsonResponse({
        total_deeds: totalDeeds,
        badge_name: badge.name,
        badge_emoji: badge.emoji,
        next_badge_name: badge.next_name,
        next_badge_emoji: badge.next_emoji,
        deeds_to_next_badge: badge.deeds_to_next,
        is_captain: captainTeamId !== null,
        captain_of_team: captainTeamId ? { id: captainTeamId, name: captainTeamName } : null,
      })
    }

    // ── GET /players/:username ────────────────────────────────────────────────
    // Viewable by any registered player (requireAuth, not self-only) — deliberately
    // narrower than /leaderboard/players' display_name (which can include a real
    // name): a profile only ever shows the username, never first/last name, and
    // never city — just country — matching the stricter privacy bar set for Share
    // My Impact and Community Voices rather than the older Leaderboard convention.
    const playerProfileMatch = path.match(/^\/players\/([^/]+)$/)
    if (method === 'GET' && playerProfileMatch) {
      const me = requireAuth(authUser)
      const lookupUsername = decodeURIComponent(playerProfileMatch[1])

      // "me" is a self-referencing alias (no username lookup needed) so the
      // frontend can link to "my profile" without having to know its own
      // username — the page then swaps the URL to the real username once loaded.
      const profileQuery = supabase
        .from('users')
        .select('id, username, player_number, created_at, current_streak_days, longest_streak_days, country_id')
      const { data: targetUser } = lookupUsername.toLowerCase() === 'me'
        ? await profileQuery.eq('id', me.sub).maybeSingle()
        : await profileQuery.ilike('username', lookupUsername).maybeSingle()
      if (!targetUser || !targetUser.username) return errorResponse('Player not found', 404)

      const { data: cards } = await supabase
        .from('player_cards')
        .select('completed_cells, purchased_cells, referral_cells')
        .eq('user_id', targetUser.id)

      let totalDeeds = 0
      for (const card of (cards ?? [])) {
        const completed: number[] = Array.isArray(card.completed_cells) ? card.completed_cells : parseJsonArr(card.completed_cells)
        const purchased: number[] = Array.isArray(card.purchased_cells) ? card.purchased_cells : parseJsonArr(card.purchased_cells)
        const referral: number[] = Array.isArray(card.referral_cells) ? card.referral_cells : parseJsonArr(card.referral_cells)
        const purchasedSet = new Set(purchased)
        const referralSet = new Set(referral)
        for (const idx of completed) {
          if (!purchasedSet.has(idx) && !referralSet.has(idx) && idx !== 12) totalDeeds++
        }
      }
      // Matches /leaderboard/players' fuller "all-time deeds" definition
      // (cards + quick taps) — note this is a wider count than /my-profile's
      // own badge (cards only, no quick taps), a pre-existing inconsistency
      // between those two endpoints that this doesn't attempt to fix.
      const { count: quickTapCount } = await supabase
        .from('quick_deed_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', targetUser.id)
      totalDeeds += quickTapCount ?? 0

      const badge = getBadge(totalDeeds)

      const { data: teamMembership } = await supabase
        .from('team_members').select('team_id').eq('user_id', targetUser.id).maybeSingle()
      let teamName: string | null = null
      if (teamMembership?.team_id) {
        const { data: t } = await supabase.from('teams').select('team_name').eq('id', teamMembership.team_id).maybeSingle()
        teamName = t?.team_name ?? null
      }

      let countryName: string | null = null
      if (targetUser.country_id) {
        const { data: c } = await supabase.from('countries').select('name').eq('id', targetUser.country_id).maybeSingle()
        countryName = c?.name ?? null
      }

      return jsonResponse({
        username: targetUser.username,
        player_number: targetUser.player_number,
        member_since: targetUser.created_at,
        total_deeds: totalDeeds,
        badge_name: badge.name,
        badge_emoji: badge.emoji,
        next_badge_name: badge.next_name,
        next_badge_emoji: badge.next_emoji,
        deeds_to_next_badge: badge.deeds_to_next,
        current_streak_days: targetUser.current_streak_days ?? 0,
        longest_streak_days: targetUser.longest_streak_days ?? 0,
        country_name: countryName,
        team_name: teamName,
      })
    }

    // ── GET /admin/player-badges ──────────────────────────────────────────────
    if (method === 'GET' && path === '/admin/player-badges') {
      requireAdmin(authUser)

      const { data: allCards } = await supabase
        .from('player_cards')
        .select('user_id, completed_cells, purchased_cells, referral_cells')

      const { data: allUsers } = await supabase
        .from('users')
        .select('id, first_name, last_name, player_number')

      // Tally deeds per user
      const deedCounts: Record<string, number> = {}
      for (const card of (allCards ?? [])) {
        const completed: number[] = Array.isArray(card.completed_cells) ? card.completed_cells : parseJsonArr(card.completed_cells)
        const purchased: number[] = Array.isArray(card.purchased_cells) ? card.purchased_cells : parseJsonArr(card.purchased_cells)
        const referral: number[] = Array.isArray(card.referral_cells) ? card.referral_cells : parseJsonArr(card.referral_cells)
        const purchasedSet = new Set(purchased)
        const referralSet = new Set(referral)
        let count = 0
        for (const idx of completed) {
          if (!purchasedSet.has(idx) && !referralSet.has(idx) && idx !== 12) {
            count++
          }
        }
        deedCounts[card.user_id] = (deedCounts[card.user_id] ?? 0) + count
      }

      const players = (allUsers ?? []).map((u) => {
        const total = deedCounts[u.id] ?? 0
        const badge = getBadge(total)
        return {
          user_id: u.id,
          first_name: u.first_name,
          last_name: u.last_name,
          player_number: u.player_number,
          total_deeds: total,
          badge_name: badge.name,
          badge_emoji: badge.emoji,
        }
      }).sort((a, b) => b.total_deeds - a.total_deeds)

      return jsonResponse({ players })
    }

    // ── GET /targeting-attributes (player-facing, no admin required) ─────────
    if (method === 'GET' && path === '/targeting-attributes') {
      requireAuth(authUser)
      const { data: attrs } = await supabase
        .from('targeting_attributes').select('id, name, display_order')
        .eq('is_active', true).order('display_order')
      const { data: vals } = await supabase
        .from('targeting_values').select('id, attribute_id, label, description, is_default, display_order')
        .eq('is_active', true).order('display_order')
      const valsByAttr = new Map<number, typeof vals>()
      for (const v of vals ?? []) {
        if (!valsByAttr.has(v.attribute_id)) valsByAttr.set(v.attribute_id, [])
        valsByAttr.get(v.attribute_id)!.push(v)
      }
      const attributes = (attrs ?? []).map((a) => ({
        id: a.id, name: a.name, display_order: a.display_order,
        values: valsByAttr.get(a.id) ?? [],
      }))
      return jsonResponse({ attributes })
    }

    // ── GET /my-profile/targeting ─────────────────────────────────────────────
    if (method === 'GET' && path === '/my-profile/targeting') {
      const user = requireAuth(authUser)
      const { data } = await supabase
        .from('user_targeting_values').select('targeting_value_id').eq('user_id', user.sub)
      return jsonResponse({ targeting_value_ids: (data ?? []).map((r) => Number(r.targeting_value_id)) })
    }

    // ── PUT /my-profile/targeting ─────────────────────────────────────────────
    if (method === 'PUT' && path === '/my-profile/targeting') {
      const user = requireAuth(authUser)
      const body = await req.json()
      const ids: number[] = (body.targeting_value_ids ?? []).map(Number).filter((n: number) => Number.isFinite(n) && n > 0)
      await supabase.from('user_targeting_values').delete().eq('user_id', user.sub)
      if (ids.length > 0) {
        const rows = ids.map((v) => ({ user_id: user.sub, targeting_value_id: v }))
        const { error } = await supabase.from('user_targeting_values').insert(rows)
        if (error) throw error
      }
      return jsonResponse({ success: true })
    }

    // ── GET /my-profile/details ───────────────────────────────────────────────
    if (method === 'GET' && path === '/my-profile/details') {
      const user = requireAuth(authUser)
      const { data: u } = await supabase
        .from('users')
        .select('first_name, last_name, username, email, city, country_id, state_id, player_number')
        .eq('id', user.sub)
        .maybeSingle()
      if (!u) return errorResponse('User not found', 404)
      return jsonResponse(u)
    }

    // ── PUT /my-profile ───────────────────────────────────────────────────────
    if (method === 'PUT' && path === '/my-profile') {
      const user = requireAuth(authUser)
      const body = await req.json()
      const { first_name, last_name, username, city, country_id, state_id } = body

      if (username) {
        const { data: existing } = await supabase
          .from('users').select('id').eq('username', username).neq('id', user.sub).maybeSingle()
        if (existing) return errorResponse('Username is already taken', 409)
      }

      const { error: profileErr } = await supabase.from('users').update({
        ...(first_name !== undefined && { first_name }),
        ...(last_name !== undefined && { last_name }),
        ...(username !== undefined && { username }),
        ...(city !== undefined && { city }),
        ...(country_id !== undefined && { country_id }),
        ...(state_id !== undefined && { state_id }),
      }).eq('id', user.sub)

      if (profileErr) {
        const friendly = friendlyUsersConflictError(profileErr)
        if (friendly) return errorResponse(friendly, 409)
        throw profileErr
      }

      return jsonResponse({ success: true })
    }

    // ── DELETE /my-profile ────────────────────────────────────────────────────
    if (method === 'DELETE' && path === '/my-profile') {
      const user = requireAuth(authUser)
      await supabase.from('square_trades').delete().eq('from_user_id', user.sub)
      await supabase.from('square_trades').delete().eq('to_user_id', user.sub)
      await supabase.from('team_members').delete().eq('user_id', user.sub)
      await supabase.from('pending_deeds').delete().eq('user_id', user.sub)
      await supabase.from('player_cards').delete().eq('user_id', user.sub)
      await supabase.from('wallet_transactions').delete().eq('user_id', user.sub)
      await supabase.from('player_wallets').delete().eq('user_id', user.sub)
      await supabase.from('users').delete().eq('id', user.sub)
      return jsonResponse({ success: true })
    }

    // ── POST /admin/players ───────────────────────────────────────────────────
    if (method === 'POST' && path === '/admin/players') {
      requireAdmin(authUser)
      const body = await req.json()

      const email = String(body.email ?? '').trim().toLowerCase()
      const username = String(body.username ?? '').trim()
      const password = String(body.password ?? '')
      if (!email || !password) return errorResponse('email and password are required', 400)

      const { data: emailExists } = await supabase.from('users').select('id').eq('email', email).maybeSingle()
      if (emailExists) return errorResponse('Email already in use', 409)
      if (username) {
        const { data: uExists } = await supabase.from('users').select('id').eq('username', username).maybeSingle()
        if (uExists) return errorResponse('Username already taken', 409)
      }

      const passwordHash = await bcrypt.hash(password, 10)
      const userId = crypto.randomUUID()
      const { error } = await supabase.from('users').insert({
        id: userId,
        email,
        username: username || null,
        password_hash: passwordHash,
        first_name: body.first_name ?? null,
        last_name: body.last_name ?? null,
        role: body.role ?? 'user',
        email_verified: true,
      })
      if (error) {
        const friendly = friendlyUsersConflictError(error)
        if (friendly) return errorResponse(friendly, 409)
        throw error
      }
      return jsonResponse({ success: true, user_id: userId })
    }

    // ── PUT /admin/players/:id ────────────────────────────────────────────────
    const adminPlayerPutMatch = method === 'PUT' && path.match(/^\/admin\/players\/([^/]+)$/)
    if (adminPlayerPutMatch) {
      requireAdmin(authUser)
      const targetId = adminPlayerPutMatch[1]
      const body = await req.json()

      const { first_name, last_name, email, username, city, country_id, state_id, role } = body

      if (email) {
        const { data: existing } = await supabase.from('users').select('id').eq('email', email).neq('id', targetId).maybeSingle()
        if (existing) return errorResponse('Email already in use', 409)
      }
      if (username) {
        const { data: existing } = await supabase.from('users').select('id').eq('username', username).neq('id', targetId).maybeSingle()
        if (existing) return errorResponse('Username already taken', 409)
      }

      const { error: playerUpdateErr } = await supabase.from('users').update({
        ...(first_name !== undefined && { first_name }),
        ...(last_name !== undefined && { last_name }),
        ...(email !== undefined && { email }),
        ...(username !== undefined && { username }),
        ...(city !== undefined && { city }),
        ...(country_id !== undefined && { country_id }),
        ...(state_id !== undefined && { state_id }),
        ...(role !== undefined && { role }),
        ...('is_trusted' in body && { is_trusted: body.is_trusted === true }),
        ...('is_test' in body && { is_test: body.is_test === true }),
      }).eq('id', targetId)

      if (playerUpdateErr) {
        const friendly = friendlyUsersConflictError(playerUpdateErr)
        if (friendly) return errorResponse(friendly, 409)
        throw playerUpdateErr
      }

      return jsonResponse({ success: true })
    }

    // ── GET /my-streak ────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/my-streak') {
      const user = requireAuth(authUser)
      const { data: userRow } = await supabase
        .from('users').select('current_streak_days, longest_streak_days, last_valid_deed_date')
        .eq('id', user.sub).maybeSingle()
      if (!userRow) return errorResponse('User not found', 404)

      // Check for a missed day and reset if needed (lazy evaluation on load)
      const today = new Date().toISOString().slice(0, 10)
      const yd = new Date(); yd.setUTCDate(yd.getUTCDate() - 1)
      const yesterday = yd.toISOString().slice(0, 10)
      const lastDate: string | null = userRow.last_valid_deed_date

      let current: number = userRow.current_streak_days ?? 0
      const longest: number = userRow.longest_streak_days ?? 0

      if (lastDate && lastDate !== today && lastDate !== yesterday && current > 0) {
        // Missed at least one day — reset current streak display
        await supabase.from('users').update({ current_streak_days: 0 }).eq('id', user.sub)
        current = 0
      }

      const { data: achievements } = await supabase
        .from('player_streak_achievements')
        .select('achieved_at, streak_milestones(days_required, label, message)')
        .eq('user_id', user.sub)
        .order('achieved_at', { ascending: false })

      return jsonResponse({
        current_streak_days: current,
        longest_streak_days: longest,
        last_valid_deed_date: lastDate,
        achievements: (achievements ?? []).map((a: any) => ({
          days_required: a.streak_milestones?.days_required,
          label: a.streak_milestones?.label,
          message: a.streak_milestones?.message,
          achieved_at: a.achieved_at,
        })),
      })
    }

    // ── GET /leaderboard/streaks ──────────────────────────────────────────────
    if (method === 'GET' && path === '/leaderboard/streaks') {
      const { data: current } = await supabase
        .from('users').select('username, name, current_streak_days, last_valid_deed_date')
        .gt('current_streak_days', 0)
        .order('current_streak_days', { ascending: false })
        .limit(20)
      const { data: longest } = await supabase
        .from('users').select('username, name, longest_streak_days, last_valid_deed_date')
        .gt('longest_streak_days', 0)
        .order('longest_streak_days', { ascending: false })
        .limit(20)
      // Average current streak across active streakers (computed in-JS; the old
      // streak_average RPC was never created and the .catch on the builder threw).
      let averageStreak: number | null = null
      try {
        const { data: streakRows } = await supabase
          .from('users').select('current_streak_days').gt('current_streak_days', 0)
        if (streakRows && streakRows.length) {
          const sum = streakRows.reduce((s: number, r: any) => s + (r.current_streak_days || 0), 0)
          averageStreak = Math.round((sum / streakRows.length) * 10) / 10
        }
      } catch (_e) {
        averageStreak = null
      }
      return jsonResponse({
        current_streak_leaders: current ?? [],
        longest_streak_leaders: longest ?? [],
        average_streak: averageStreak,
      })
    }

    // ── GET /leaderboard/teams ────────────────────────────────────────────────
    if (method === 'GET' && path === '/leaderboard/teams') {
      const { data: cd } = await supabase
        .from('completed_deeds')
        .select('team_id_at_completion, player_id')
        .eq('is_hidden_from_impact_board', false)
        .not('team_id_at_completion', 'is', null)

      const byTeam = new Map<number, { deeds: number; players: Set<string> }>()
      for (const row of cd ?? []) {
        const tid = row.team_id_at_completion as number
        if (!byTeam.has(tid)) byTeam.set(tid, { deeds: 0, players: new Set() })
        const entry = byTeam.get(tid)!
        entry.deeds++
        entry.players.add(row.player_id)
      }

      const teamIds = [...byTeam.keys()]
      const { data: teamRows } = teamIds.length
        ? await supabase.from('teams').select('id, team_name, team_number').in('id', teamIds)
        : { data: [] }
      const { data: memberRows } = teamIds.length
        ? await supabase.from('team_members').select('team_id').in('team_id', teamIds)
        : { data: [] }
      const totalMembersByTeam = new Map<number, number>()
      for (const m of memberRows ?? []) {
        totalMembersByTeam.set(m.team_id, (totalMembersByTeam.get(m.team_id) ?? 0) + 1)
      }
      const teamInfoById = new Map((teamRows ?? []).map((t) => [t.id, t]))

      const teams = teamIds
        .map((tid) => {
          const info = teamInfoById.get(tid)
          const agg = byTeam.get(tid)!
          return {
            team_id: tid,
            team_number: info?.team_number ?? null,
            team_name: info?.team_name ?? 'Unknown Team',
            deeds: agg.deeds,
            active_members: agg.players.size,
            total_members: totalMembersByTeam.get(tid) ?? 0,
          }
        })
        .sort((a, b) => b.deeds - a.deeds)

      return jsonResponse({ teams })
    }

    // ── POST /admin/backfill-completed-deeds ──────────────────────────────────
    // One-time: reconstruct historical completed_deeds from existing logs.
    // Guarded: admin only, and aborts if completed_deeds already has rows.
    if (method === 'POST' && path === '/admin/backfill-completed-deeds') {
      requireAdmin(authUser)
      const { count: existing } = await supabase.from('completed_deeds').select('id', { count: 'exact', head: true })
      if ((existing ?? 0) > 0) return jsonResponse({ skipped: true, existing })

      const { data: users } = await supabase.from('users').select('id, city, province_state, country_id')
      const userMap = new Map((users ?? []).map((u: any) => [u.id, u]))
      const { data: countries } = await supabase.from('countries').select('id, name')
      const countryMap = new Map((countries ?? []).map((c: any) => [c.id, c.name]))
      const { data: teamRows } = await supabase.from('team_members').select('user_id, team_id')
      const teamMap = new Map((teamRows ?? []).map((t: any) => [t.user_id, t.team_id]))
      const { data: gd } = await supabase.from('good_deeds').select('id, category')
      const deedCat = new Map((gd ?? []).map((d: any) => [d.id, d.category]))
      const loc = (uid: string) => {
        const u: any = userMap.get(uid) || {}
        return { city: u.city ?? null, province_state: u.province_state ?? null, country_id: u.country_id ?? null, country_name: u.country_id ? (countryMap.get(u.country_id) ?? null) : null }
      }
      const rows: any[] = []
      const { data: qlogs } = await supabase.from('quick_deed_logs').select('user_id, quick_deed_id, tapped_at')
      for (const q of (qlogs ?? [])) {
        if (!userMap.has(q.user_id)) continue
        rows.push({ player_id: q.user_id, team_id_at_completion: teamMap.get(q.user_id) ?? null, source_type: 'quick_action', quick_deed_id: q.quick_deed_id, category: null, ...loc(q.user_id), completed_at: q.tapped_at })
      }
      const quickCount = rows.length
      const { data: marks } = await supabase.from('cell_mark_log').select('card_id, cell_index, created_at').eq('action', 'mark')
      const markTime = new Map<string, string>()
      for (const m of (marks ?? [])) {
        const k = `${m.card_id}|${m.cell_index}`
        const prev = markTime.get(k)
        if (!prev || new Date(m.created_at) > new Date(prev)) markTime.set(k, m.created_at)
      }
      const { data: cards } = await supabase.from('player_cards').select('id, user_id, card_data, completed_cells, updated_at')
      for (const card of (cards ?? [])) {
        let completed: any[] = []; let cells: any[] = []
        try { completed = JSON.parse(card.completed_cells || '[]') } catch { completed = [] }
        try { cells = JSON.parse(card.card_data || '[]') } catch { cells = [] }
        if (!Array.isArray(completed)) completed = []
        for (const idx of completed) {
          const cell = cells[idx]
          const deedId = cell && cell.deed_id != null ? cell.deed_id : null
          if (deedId == null) continue
          rows.push({ player_id: card.user_id, team_id_at_completion: teamMap.get(card.user_id) ?? null, source_type: 'bingo_card', deed_id: deedId, category: deedCat.get(deedId) ?? (cell.category ?? null), card_id: card.id, cell_index: idx, ...loc(card.user_id), completed_at: markTime.get(`${card.id}|${idx}`) || card.updated_at || new Date().toISOString() })
        }
      }
      const cardCount = rows.length - quickCount
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from('completed_deeds').insert(rows.slice(i, i + 500))
        if (error) return errorResponse(`backfill insert failed: ${error.message}`, 500)
      }
      const { count: after } = await supabase.from('completed_deeds').select('id', { count: 'exact', head: true })
      return jsonResponse({ backfilled: rows.length, bingo_card: cardCount, quick_action: quickCount, total_now: after })
    }

    // ── GET /admin/streak-milestones ──────────────────────────────────────────
    if (method === 'GET' && path === '/admin/streak-milestones') {
      requireAdmin(authUser)
      const { data } = await supabase.from('streak_milestones').select('*').order('display_order')
      return jsonResponse({ milestones: data ?? [] })
    }

    // ── POST /admin/streak-milestones ─────────────────────────────────────────
    if (method === 'POST' && path === '/admin/streak-milestones') {
      requireAdmin(authUser)
      const body = await req.json()
      const { days_required, label, message, display_order } = body
      if (!days_required || !label || !message) return errorResponse('days_required, label, and message are required', 400)
      const { data, error } = await supabase.from('streak_milestones')
        .insert({ days_required, label, message, display_order: display_order ?? 0 })
        .select().single()
      if (error) return errorResponse(error.message, 400)
      return jsonResponse({ milestone: data })
    }

    // ── PUT /admin/streak-milestones/:id ──────────────────────────────────────
    const smEditMatch = path.match(/^\/admin\/streak-milestones\/(\d+)$/)
    if (method === 'PUT' && smEditMatch) {
      requireAdmin(authUser)
      const id = parseInt(smEditMatch[1])
      const body = await req.json()
      const updates: Record<string, unknown> = {}
      if (body.days_required !== undefined) updates.days_required = body.days_required
      if (body.label !== undefined) updates.label = body.label
      if (body.message !== undefined) updates.message = body.message
      if (body.is_active !== undefined) updates.is_active = body.is_active
      if (body.display_order !== undefined) updates.display_order = body.display_order
      const { error } = await supabase.from('streak_milestones').update(updates).eq('id', id)
      if (error) return errorResponse(error.message, 400)
      return jsonResponse({ success: true })
    }

    // ── DELETE /admin/streak-milestones/:id ───────────────────────────────────
    const smDeleteMatch = method === 'DELETE' && path.match(/^\/admin\/streak-milestones\/(\d+)$/)
    if (smDeleteMatch) {
      requireAdmin(authUser)
      const id = parseInt(smDeleteMatch[1])
      await supabase.from('player_streak_achievements').delete().eq('milestone_id', id)
      await supabase.from('streak_milestones').delete().eq('id', id)
      return jsonResponse({ success: true })
    }

    // ── POST /bet-ya-reveal ───────────────────────────────────────────────────
    // Player clicks the centre cell — execute the pre-snapshotted I Bet Ya
    // outcome. Fires once per card for every outcome except refer_friend
    // (bet_ya_revealed guards re-entry); refer_friend stays unrevealed and
    // re-invocable until /bet-ya-refer-friend actually matches an email.
    if (method === 'POST' && path === '/bet-ya-reveal') {
      const user = requireAuth(authUser)
      const body = await req.json()
      const { card_id } = body as { card_id: number }

      const { data: card } = await supabase
        .from('player_cards').select('*').eq('id', card_id).eq('user_id', user.sub).maybeSingle()
      if (!card) return errorResponse('Card not found', 404)

      const cells: Cell[] = JSON.parse(card.card_data)
      const centerCell = cells[12]

      if (!centerCell?.bet_ya_outcome_type) {
        return errorResponse('No I Bet Ya outcome on this card', 400)
      }
      if (centerCell.bet_ya_revealed) {
        return errorResponse('I Bet Ya outcome already revealed', 400)
      }

      const outcomeType = centerCell.bet_ya_outcome_type
      const actionValue = Number(centerCell.bet_ya_action_value ?? 0)
      const result: Record<string, unknown> = {
        outcome: outcomeType,
        label: centerCell.bet_ya_label ?? outcomeType,
        amount: actionValue,
      }

      // Atomically claim this reveal before executing any side effect, so two
      // concurrent requests for the same card can't both pass the "not yet
      // revealed" check above and double-apply a wallet credit/debit or a
      // duplicate bingo award. Uses updated_at as an optimistic-concurrency
      // stamp: only the request that still sees the row's pre-read updated_at
      // wins the claim: a racing second request finds 0 rows and is rejected
      // before touching the wallet. refer_friend has no one-shot side effect
      // here (see header comment) and stays re-invocable, so it's exempt.
      if (outcomeType !== 'refer_friend') {
        const { data: claimed } = await supabase
          .from('player_cards')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', card_id)
          .eq('updated_at', card.updated_at)
          .select('id')
          .maybeSingle()
        if (!claimed) {
          return errorResponse('This I Bet Ya square was already processed. Please refresh and try again.', 409)
        }
      }

      let updatedCompleted = parseJsonArr(card.completed_cells) as number[]
      const purchased = parseJsonArr(card.purchased_cells) as number[]
      const referral = parseJsonArr(card.referral_cells) as number[]

      if (outcomeType === 'free_square') {
        if (!updatedCompleted.includes(12)) updatedCompleted.push(12)

      } else if (outcomeType === 'fund_credit') {
        let { data: wallet } = await supabase.from('player_wallets').select('*').eq('user_id', user.sub).maybeSingle()
        if (!wallet) {
          const { data: w } = await supabase.from('player_wallets').insert({ user_id: user.sub, balance: 0 }).select().single()
          wallet = w
        }
        const newBalance = parseFloat(wallet.balance) + actionValue
        await supabase.from('player_wallets').update({ balance: newBalance, updated_at: new Date().toISOString() }).eq('user_id', user.sub)
        await supabase.from('wallet_transactions').insert({
          user_id: user.sub, amount: actionValue, transaction_type: 'bet_reward',
          item_description: `I Bet Ya! reward (+${actionValue.toFixed(2)} Gr8Day Bucks)`,
        })
        result.new_balance = newBalance

      } else if (outcomeType === 'remove_funds') {
        let { data: wallet } = await supabase.from('player_wallets').select('*').eq('user_id', user.sub).maybeSingle()
        if (!wallet) {
          const { data: w } = await supabase.from('player_wallets').insert({ user_id: user.sub, balance: 0 }).select().single()
          wallet = w
        }
        const currentBalance = parseFloat(wallet.balance)
        const deduction = Math.min(actionValue, currentBalance)
        const newBalance = currentBalance - deduction
        if (deduction > 0) {
          await supabase.from('player_wallets').update({ balance: newBalance, updated_at: new Date().toISOString() }).eq('user_id', user.sub)
          await supabase.from('wallet_transactions').insert({
            user_id: user.sub, amount: -deduction, transaction_type: 'bet_penalty',
            item_description: `I Bet Ya! penalty (-${deduction.toFixed(2)} Gr8Day Bucks)`,
          })
        }
        result.new_balance = newBalance
        result.amount = deduction

      } else if (outcomeType === 'refer_friend') {
        result.prompt_referral = true

      } else if (outcomeType === 'replace_three') {
        const allMarked = new Set([...updatedCompleted, ...purchased, ...referral])
        const eligibleCells = cells.filter(
          (c) => c.index !== 12 && !c.is_free_space && !c.is_purchasable && !c.is_referral_free && !c.is_secret && !allMarked.has(c.index)
        )
        // Fisher-Yates shuffle with crypto RNG
        for (let i = eligibleCells.length - 1; i > 0; i--) {
          const buf = new Uint32Array(1); crypto.getRandomValues(buf)
          const j = Math.floor((buf[0] / 4_294_967_296) * (i + 1));
          [eligibleCells[i], eligibleCells[j]] = [eligibleCells[j], eligibleCells[i]]
        }
        const toReplace = eligibleCells.slice(0, 3)

        if (toReplace.length === 0) {
          result.replaced = []
        } else {
          const existingDeedIds = new Set(cells.map((c) => c.deed_id).filter((id): id is number => id != null))
          const { data: allDeeds } = await supabase.from('good_deeds').select('*').eq('is_active', true).eq('status', 'Approved')
          const { playerValueIds, deedTargetingMap } = await fetchTargetingData(supabase, user.sub)
          const basePool = (allDeeds ?? []).filter((d) => !existingDeedIds.has(d.id))
          // targetedPool is a mutable copy we splice from to avoid duplicate picks
          const targetedPool = [...filterDeedsByTargeting(basePool, playerValueIds, deedTargetingMap, basePool)]
          const replaced: { index: number; old_deed: string; new_deed: string }[] = []
          for (const targetCell of toReplace) {
            if (targetedPool.length === 0) break
            const buf = new Uint32Array(1); crypto.getRandomValues(buf)
            const pick = Math.floor((buf[0] / 4_294_967_296) * targetedPool.length)
            const newDeed = targetedPool.splice(pick, 1)[0]
            existingDeedIds.add(newDeed.id)
            cells[targetCell.index] = {
              ...targetCell,
              deed_text: newDeed.deed_text,
              deed_text_long: newDeed.deed_text_long ?? null,
              deed_id: newDeed.id,
              quantity: newDeed.quantity ?? 1,
              category: newDeed.category ?? null,
              // Defense in depth: the eligible-cell filter above already
              // excludes is_secret cells, but never let a secret badge or
              // reward silently carry over onto an unrelated new deed.
              is_secret: false,
              secret_reward: null,
              secret_revealed: false,
            }
            replaced.push({ index: targetCell.index, old_deed: targetCell.deed_text, new_deed: newDeed.deed_text })
          }
          result.replaced = replaced
        }
      }
      // 'nothing': no side effect

      // Mark revealed on the center cell — except refer_friend, which stays
      // pending/retryable (identical to the no-match case in
      // /bet-ya-refer-friend) until a submitted email actually matches and
      // credits the reward. Setting bet_ya_revealed here unconditionally
      // would permanently disable the centre square client-side the moment
      // the player closes the modal, before they ever get to submit an
      // email — locking them out of a reward they haven't had a chance to
      // claim yet.
      cells[12] = outcomeType === 'refer_friend' ? centerCell : { ...centerCell, bet_ya_revealed: true }

      const allCompleted = [...new Set([...updatedCompleted, ...purchased, ...referral, ...freeSpaceIndices(cells)])]
      const isBingo = checkBingo(allCompleted, card.win_condition)

      const existingLines: number[] = Array.isArray(card.bonus_lines_awarded) ? card.bonus_lines_awarded : []
      const newLineIndices = completedLineIndices(allCompleted).filter((i) => !existingLines.includes(i))

      await supabase.from('player_cards').update({
        card_data: JSON.stringify(cells),
        completed_cells: JSON.stringify(updatedCompleted),
        is_bingo: isBingo,
        bonus_lines_awarded: JSON.stringify([...existingLines, ...newLineIndices]),
        updated_at: new Date().toISOString(),
      }).eq('id', card_id)

      // Award any newly-completed lines' bonuses + congratulate by email on
      // first win, same as mark-cell.
      const bonusEntries = await awardNewBingoLines(supabase, {
        playerId: user.sub, cardId: card_id, weekYear: card.week_year, playCycle: card.play_cycle ?? 0,
        newLineIndices, winCondition: card.win_condition,
        wasAlreadyBingo: card.is_bingo, isBingoNow: isBingo,
        userEmail: user.email, userName: user.name as string | undefined,
      })

      result.is_bingo = isBingo
      result.completed_cells = updatedCompleted
      if (bonusEntries > 0) result.draw_bonus_entries = bonusEntries
      return jsonResponse(result)
    }

    // ── POST /bet-ya-refer-friend ─────────────────────────────────────────────
    // Player submits an email at the "refer_friend" center square. Matches
    // against an already-validated referral (friend registered with this
    // email, referred by the current player) that hasn't been paid out via
    // this flow before. No match / already-credited: no state change, the
    // player can retry with a different email indefinitely.
    if (method === 'POST' && path === '/bet-ya-refer-friend') {
      const user = requireAuth(authUser)
      const body = await req.json()
      const { card_id } = body as { card_id: number }
      const email = String(body.email ?? '').trim().toLowerCase()
      if (!email) return errorResponse('Email is required', 400)
      if (user.email && user.email.toLowerCase() === email) {
        return errorResponse('You cannot refer yourself', 400)
      }

      const { data: card } = await supabase
        .from('player_cards').select('*').eq('id', card_id).eq('user_id', user.sub).maybeSingle()
      if (!card) return errorResponse('Card not found', 404)

      const cells: Cell[] = JSON.parse(card.card_data)
      const centerCell = cells[12]
      if (centerCell?.bet_ya_outcome_type !== 'refer_friend') {
        return errorResponse('This card\'s centre square is not a refer-a-friend outcome', 400)
      }
      const completed = parseJsonArr(card.completed_cells) as number[]
      if (completed.includes(12)) {
        return errorResponse('Centre square already completed', 400)
      }

      const { data: referralMatch } = await supabase
        .from('referrals')
        .select('id')
        .eq('user_id', user.sub)
        .eq('referred_email', email)
        .eq('is_validated', true)
        .is('bet_ya_credited_at', null)
        .maybeSingle()

      if (!referralMatch) {
        // No validated, not-yet-credited referral for this email — no state change.
        return jsonResponse({ matched: false, message: 'No matching referral found for that email yet. You can try again anytime.' })
      }

      // Atomically claim the centre square before paying out anything, so two
      // concurrent claims against two DIFFERENT valid referrals can't both
      // credit the wallet for a square that's only supposed to complete once.
      // Same optimistic-concurrency pattern as /bet-ya-reveal: only the
      // request that still sees the row's pre-read updated_at wins the claim;
      // a losing concurrent request is rejected here, before it ever stamps a
      // referral or touches the wallet.
      const { data: claimed } = await supabase
        .from('player_cards')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', card_id)
        .eq('updated_at', card.updated_at)
        .select('id')
        .maybeSingle()
      if (!claimed) {
        return errorResponse('This centre square was already completed. Please refresh and try again.', 409)
      }

      // Stamp the referral row so a future retry/race can't double-pay it.
      await supabase.from('referrals').update({ bet_ya_credited_at: new Date().toISOString() }).eq('id', referralMatch.id)

      const rewardAmount = Number(centerCell.bet_ya_action_value ?? 0)
      let { data: wallet } = await supabase.from('player_wallets').select('*').eq('user_id', user.sub).maybeSingle()
      if (!wallet) {
        const { data: w } = await supabase.from('player_wallets').insert({ user_id: user.sub, balance: 0 }).select().single()
        wallet = w
      }
      const newBalance = parseFloat(wallet.balance) + rewardAmount
      await supabase.from('player_wallets').update({ balance: newBalance, updated_at: new Date().toISOString() }).eq('user_id', user.sub)
      await supabase.from('wallet_transactions').insert({
        user_id: user.sub, amount: rewardAmount, transaction_type: 'bet_referral_reward',
        item_description: `I Bet Ya! Friend Referred reward (+${rewardAmount.toFixed(2)} Gr8Day Bucks)`,
      })

      cells[12] = { ...centerCell, bet_ya_label: 'Friend Referred', bet_ya_revealed: true }
      const updatedCompleted = [...completed, 12]
      const purchased = parseJsonArr(card.purchased_cells) as number[]
      const referral = parseJsonArr(card.referral_cells) as number[]
      const allCompleted = [...new Set([...updatedCompleted, ...purchased, ...referral, ...freeSpaceIndices(cells)])]
      const isBingo = checkBingo(allCompleted, card.win_condition)

      const existingLines: number[] = Array.isArray(card.bonus_lines_awarded) ? card.bonus_lines_awarded : []
      const newLineIndices = completedLineIndices(allCompleted).filter((i) => !existingLines.includes(i))

      await supabase.from('player_cards').update({
        card_data: JSON.stringify(cells),
        completed_cells: JSON.stringify(updatedCompleted),
        is_bingo: isBingo,
        bonus_lines_awarded: JSON.stringify([...existingLines, ...newLineIndices]),
        updated_at: new Date().toISOString(),
      }).eq('id', card_id)

      const result: Record<string, unknown> = {
        matched: true, label: 'Friend Referred', amount: rewardAmount, new_balance: newBalance,
        completed_cells: updatedCompleted, is_bingo: isBingo,
      }

      const bonusEntries = await awardNewBingoLines(supabase, {
        playerId: user.sub, cardId: card_id, weekYear: card.week_year, playCycle: card.play_cycle ?? 0,
        newLineIndices, winCondition: card.win_condition,
        wasAlreadyBingo: card.is_bingo, isBingoNow: isBingo,
        userEmail: user.email, userName: user.name as string | undefined,
      })
      if (bonusEntries > 0) result.draw_bonus_entries = bonusEntries

      return jsonResponse(result)
    }

    // ── GET /admin/bet-ya-outcomes ────────────────────────────────────────────
    if (method === 'GET' && path === '/admin/bet-ya-outcomes') {
      requireAdmin(authUser)
      let { data } = await supabase.from('bet_ya_outcomes').select('*').order('id')
      // If the table has been emptied out (e.g. all rows manually deleted
      // outside the admin API), reseed an equal split across all six outcome
      // types rather than leaving card generation with no active pool to draw from.
      if (!data || data.length === 0) {
        const EQUAL_SPLIT_DEFAULTS = [
          { label: 'Free Square!', action_type: 'free_square', odds_percent: 16.67, credit_amount: 0, remove_amount: 0, reward_amount: 0 },
          { label: 'Refer a Friend!', action_type: 'refer_friend', odds_percent: 16.67, credit_amount: 0, remove_amount: 0, reward_amount: 5 },
          { label: 'Fund Credit!', action_type: 'fund_credit', odds_percent: 16.67, credit_amount: 10, remove_amount: 0, reward_amount: 0 },
          { label: 'Oops, Pay Up!', action_type: 'remove_funds', odds_percent: 16.67, credit_amount: 0, remove_amount: 0.5, reward_amount: 0 },
          { label: 'Mix It Up!', action_type: 'replace_three', odds_percent: 16.66, credit_amount: 0, remove_amount: 0, reward_amount: 0 },
          { label: 'No Effect', action_type: 'nothing', odds_percent: 16.66, credit_amount: 0, remove_amount: 0, reward_amount: 0 },
        ].map((row) => ({ ...row, is_active: true, updated_at: new Date().toISOString() }))
        const { data: seeded, error: seedErr } = await supabase.from('bet_ya_outcomes').insert(EQUAL_SPLIT_DEFAULTS).select()
        if (seedErr) return errorResponse(seedErr.message, 500)
        data = seeded
      }
      return jsonResponse({ outcomes: data ?? [] })
    }

    // Server-side guard mirroring the admin UI's 100% gate: sums the *active*
    // odds_percent across all rows, substituting in a pending add/edit before
    // persisting, so a bad request can never leave the table off 100%.
    async function assertActiveOddsSumTo100(
      excludeId: number | null,
      pendingIsActive: boolean,
      pendingPercent: number,
    ): Promise<string | null> {
      const { data: rows } = await supabase.from('bet_ya_outcomes').select('id, odds_percent, is_active')
      let total = (rows ?? [])
        .filter((r) => r.id !== excludeId && r.is_active)
        .reduce((s, r) => s + Number(r.odds_percent), 0)
      if (pendingIsActive) total += pendingPercent
      if (Math.abs(total - 100) > 0.01) {
        return `Active outcome percentages must sum to exactly 100% (currently ${total.toFixed(2)}%)`
      }
      return null
    }

    // Guards against admin typos (e.g. a stray minus sign) silently corrupting
    // wallet payouts or the odds draw — every numeric field on a bet_ya_outcomes
    // row must be non-negative, and odds_percent must be a valid percentage.
    function validateBetYaNumeric(
      oddsPercent: number, creditAmount: number, removeAmount: number, rewardAmount: number,
    ): string | null {
      if (!Number.isFinite(oddsPercent) || oddsPercent < 0 || oddsPercent > 100) {
        return 'odds_percent must be between 0 and 100'
      }
      if (!Number.isFinite(creditAmount) || creditAmount < 0) return 'credit_amount must be >= 0'
      if (!Number.isFinite(removeAmount) || removeAmount < 0) return 'remove_amount must be >= 0'
      if (!Number.isFinite(rewardAmount) || rewardAmount < 0) return 'reward_amount must be >= 0'
      return null
    }

    // ── POST /admin/bet-ya-outcomes ───────────────────────────────────────────
    if (method === 'POST' && path === '/admin/bet-ya-outcomes') {
      requireAdmin(authUser)
      const body = await req.json()
      const VALID_TYPES = ['free_square','refer_friend','fund_credit','remove_funds','replace_three','nothing']
      if (!VALID_TYPES.includes(body.action_type)) return errorResponse('Invalid action_type', 400)
      const oddsPercent = Number(body.odds_percent ?? 0)
      const creditAmount = Number(body.credit_amount ?? 0)
      const removeAmount = Number(body.remove_amount ?? 0)
      const rewardAmount = Number(body.reward_amount ?? 5)
      const numErr = validateBetYaNumeric(oddsPercent, creditAmount, removeAmount, rewardAmount)
      if (numErr) return errorResponse(numErr, 400)
      const isActive = body.is_active !== false
      const sumErr = await assertActiveOddsSumTo100(null, isActive, oddsPercent)
      if (sumErr) return errorResponse(sumErr, 400)
      const { data, error } = await supabase.from('bet_ya_outcomes').insert({
        label: String(body.label ?? '').trim(),
        odds_percent: oddsPercent,
        action_type: body.action_type,
        credit_amount: creditAmount,
        remove_amount: removeAmount,
        reward_amount: rewardAmount,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      }).select().single()
      if (error) return errorResponse(error.message, 400)
      return jsonResponse({ outcome: data })
    }

    // ── PUT /admin/bet-ya-outcomes/:id ────────────────────────────────────────
    const betYaUpdateMatch = method === 'PUT' && path.match(/^\/admin\/bet-ya-outcomes\/(\d+)$/)
    if (betYaUpdateMatch) {
      requireAdmin(authUser)
      const id = parseInt(betYaUpdateMatch[1])
      const body = await req.json()
      const { data: existingRow } = await supabase.from('bet_ya_outcomes').select('*').eq('id', id).maybeSingle()
      if (!existingRow) return errorResponse('Outcome not found', 404)
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (body.label != null) updates.label = String(body.label).trim()
      if (body.odds_percent != null) updates.odds_percent = Number(body.odds_percent)
      if (body.credit_amount != null) updates.credit_amount = Number(body.credit_amount)
      if (body.remove_amount != null) updates.remove_amount = Number(body.remove_amount)
      if (body.reward_amount != null) updates.reward_amount = Number(body.reward_amount)
      if (body.is_active != null) updates.is_active = Boolean(body.is_active)
      const VALID_TYPES = ['free_square','refer_friend','fund_credit','remove_funds','replace_three','nothing']
      if (body.action_type != null) {
        if (!VALID_TYPES.includes(body.action_type)) return errorResponse('Invalid action_type', 400)
        updates.action_type = body.action_type
      }
      const pendingPercent = (updates.odds_percent as number | undefined) ?? Number(existingRow.odds_percent)
      const pendingCredit = (updates.credit_amount as number | undefined) ?? Number(existingRow.credit_amount)
      const pendingRemove = (updates.remove_amount as number | undefined) ?? Number(existingRow.remove_amount)
      const pendingReward = (updates.reward_amount as number | undefined) ?? Number(existingRow.reward_amount)
      const numErr = validateBetYaNumeric(pendingPercent, pendingCredit, pendingRemove, pendingReward)
      if (numErr) return errorResponse(numErr, 400)
      const pendingIsActive = (updates.is_active as boolean | undefined) ?? Boolean(existingRow.is_active)
      const sumErr = await assertActiveOddsSumTo100(id, pendingIsActive, pendingPercent)
      if (sumErr) return errorResponse(sumErr, 400)
      const { data, error } = await supabase.from('bet_ya_outcomes').update(updates).eq('id', id).select().single()
      if (error) return errorResponse(error.message, 400)
      return jsonResponse({ outcome: data })
    }

    // ── DELETE /admin/bet-ya-outcomes/:id ─────────────────────────────────────
    const betYaDeleteMatch = method === 'DELETE' && path.match(/^\/admin\/bet-ya-outcomes\/(\d+)$/)
    if (betYaDeleteMatch) {
      requireAdmin(authUser)
      const id = parseInt(betYaDeleteMatch[1])
      const { data: existingRow } = await supabase.from('bet_ya_outcomes').select('is_active').eq('id', id).maybeSingle()
      if (!existingRow) return errorResponse('Outcome not found', 404)
      // Only an active row's removal can break the 100% invariant — deleting
      // an already-inactive row never changes the active total.
      if (existingRow.is_active) {
        const sumErr = await assertActiveOddsSumTo100(id, false, 0)
        if (sumErr) return errorResponse(sumErr, 400)
      }
      await supabase.from('bet_ya_outcomes').delete().eq('id', id)
      return jsonResponse({ success: true })
    }

    // ── DELETE /admin/players/:id ─────────────────────────────────────────────
    const adminPlayerDeleteMatch = method === 'DELETE' && path.match(/^\/admin\/players\/([^/]+)$/)
    if (adminPlayerDeleteMatch) {
      requireAdmin(authUser)
      const targetId = adminPlayerDeleteMatch[1]

      await supabase.from('square_trades').delete().eq('from_user_id', targetId)
      await supabase.from('square_trades').delete().eq('to_user_id', targetId)
      await supabase.from('team_members').delete().eq('user_id', targetId)
      await supabase.from('pending_deeds').delete().eq('user_id', targetId)
      await supabase.from('player_cards').delete().eq('user_id', targetId)
      await supabase.from('wallet_transactions').delete().eq('user_id', targetId)
      await supabase.from('player_wallets').delete().eq('user_id', targetId)
      await supabase.from('users').delete().eq('id', targetId)
      return jsonResponse({ success: true })
    }

    return errorResponse('Not found', 404)
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'status' in err) {
      const e = err as { status: number; detail: string }
      return errorResponse(e.detail, e.status)
    }
    console.error('game error:', err)
    return errorResponse('Internal server error', 500)
  }
})
