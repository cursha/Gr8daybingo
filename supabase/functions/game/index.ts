import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthUser, requireAuth, requireAdmin } from '../_shared/auth.ts'
import { getSupabase, getSubPath, matchPath } from '../_shared/db.ts'
import { sendEmail, passwordResetEmail, referralInviteEmail, bingoWinEmail, prizeClaimConfirmationEmail, gameAnnouncementEmail } from '../_shared/email.ts'
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
}

// ── Security: strip secret fields before sending cells to client ─────────────
// is_secret and secret_reward must never be exposed until the square is revealed.
function sanitizeCells(cells: Cell[], completedCells: number[]): unknown[] {
  return cells.map((c) => {
    const revealed = c.secret_revealed === true || completedCells.includes(c.index)
    const { is_secret, secret_reward, secret_revealed, ...rest } = c
    return {
      ...rest,
      // Only tell the client a square is secret AFTER it has been marked
      ...(is_secret && revealed ? { is_secret: true, secret_reward, secret_revealed: true } : {}),
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

function checkBingo(completed: number[], winCondition: string): boolean {
  const s = new Set(completed)
  const lines: number[][] = []
  for (let r = 0; r < 5; r++) lines.push([r * 5, r * 5 + 1, r * 5 + 2, r * 5 + 3, r * 5 + 4])
  for (let c = 0; c < 5; c++) lines.push([c, c + 5, c + 10, c + 15, c + 20])
  lines.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20])
  const sub = (line: number[]) => line.every((x) => s.has(x))
  switch (winCondition) {
    case 'one_line': return lines.some(sub)
    case 'two_lines': return lines.filter(sub).length >= 2
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

/** Free-space cells (the I DARE YA centre) always count toward Bingo, even
 *  though they are never "marked". Returns their indices from the card data. */
function freeSpaceIndices(cells: Cell[]): number[] {
  return cells.filter((c) => c.is_free_space).map((c) => c.index)
}

const WIN_LABELS: Record<string, string> = {
  one_line: 'One Line', two_lines: 'Two Lines', four_corners: 'Four Corners',
  x_pattern: 'X Pattern', around_the_edges: 'Around the Edges', fill_card: 'Fill the Card',
}
function winLabel(cond: string): string { return WIN_LABELS[cond] ?? cond }

/** Impact Board time filters: ISO start of the current month/quarter/year, or
 *  null for "life to date" (no lower bound). UTC-based. */
function impactPeriodStart(period: string): string | null {
  const now = new Date()
  const y = now.getUTCFullYear(), m = now.getUTCMonth()
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
): Promise<void> {
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
    if (!category && opts.deedId != null) {
      const { data: d } = await supabase.from('good_deeds').select('category').eq('id', opts.deedId).maybeSingle()
      category = d?.category ?? null
    }
    await supabase.from('completed_deeds').insert({
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
    })
  } catch (_e) {
    // swallow — impact recording is never allowed to break gameplay
  }
}

// Referral gating (Curt): non-referred players are capped at a table-driven
// number of completed Gr8Day Deeds per rolling 24h. A player counts as
// "referred" if their email appears as a referred_email in the referrals table.
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

    // Referred players are unlimited.
    const email = (user.email ?? '').trim().toLowerCase()
    if (email) {
      const { count: refCount } = await supabase
        .from('referrals').select('id', { count: 'exact', head: true }).ilike('referred_email', email)
      if ((refCount ?? 0) > 0) return { allowed: true }
    }

    // Non-referred: count completed deeds in the last rolling 24h.
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

    // ── POST /generate-card ───────────────────────────────────────────────────
    if (method === 'POST' && path === '/generate-card') {
      const user = requireAuth(authUser)
      const weekYear = getCurrentWeekYear()

      // Read admin win condition
      const { data: wcCfg } = await supabase
        .from('game_configs').select('config_value').eq('config_key', 'win_condition').maybeSingle()
      const adminWinCondition = wcCfg?.config_value ?? 'one_line'

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
        const deedIds = cells.map((c) => c.deed_id).filter((id): id is number => id != null)
        if (deedIds.length > 0) {
          const { data: freshDeeds } = await supabase
            .from('good_deeds').select('id, quantity, category').in('id', deedIds)
          const qtyById = new Map<number, number>()
          const catById = new Map<number, string | null>()
          for (const d of freshDeeds ?? []) {
            qtyById.set(d.id, d.quantity ?? 1)
            catById.set(d.id, d.category ?? null)
          }
          for (const c of cells) {
            if (c.deed_id != null && qtyById.has(c.deed_id)) {
              const freshQty = qtyById.get(c.deed_id)!
              if (c.quantity !== freshQty) {
                c.quantity = freshQty
                needsSave = true
              }
              c.category = catById.get(c.deed_id) ?? null
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

        return jsonResponse({
          card_id: existing.id,
          week_year: existing.week_year,
          cells: sanitizeCells(cells, completedIdx),
          win_condition: existing.win_condition,
          completed_cells: completedIdx,
          purchased_cells: parseJsonArr(existing.purchased_cells),
          referral_cells: parseJsonArr(existing.referral_cells),
          is_bingo: existing.is_bingo ?? false,
          dare_clicks: existing.dare_clicks ?? 0,
          draw_entered: drawEntry != null,
        })
      }

      // Build a new card — only use deeds from active categories
      const { data: activeCategories } = await supabase
        .from('deed_categories').select('name').eq('is_active', true)
      const activeCategoryNames = (activeCategories ?? []).map(c => c.name)

      let deedQuery = supabase.from('good_deeds').select('*').eq('is_active', true)
      if (activeCategoryNames.length > 0) {
        deedQuery = deedQuery.in('category', activeCategoryNames)
      }
      const { data: deeds } = await deedQuery
      if (!deeds || deeds.length < 24) {
        return errorResponse('Not enough active deeds in the selected categories to generate a card', 400)
      }

      const { data: cfgRows } = await supabase.from('game_configs').select('config_key, config_value')
      const cfg: Record<string, string> = {}
      for (const r of cfgRows ?? []) cfg[r.config_key] = r.config_value ?? ''

      const dollar1Pct = parseInt(cfg['dollar1_pct'] ?? '50')
      const dollar2Pct = parseInt(cfg['dollar2_pct'] ?? '30')
      const secret1Pct = parseInt(cfg['secret_reward_1_pct'] ?? '50')
      const secret2Pct = parseInt(cfg['secret_reward_2_pct'] ?? '30')

      const seed = await sha256Hex(`${user.email ?? user.sub}:${weekYear}`)
      const rng = new SeededRandom(seed)

      const purchasableCount = rng.randint(1, 3)
      const referralFreeCount = 0

      const deedList = [...deeds]
      rng.shuffle(deedList)
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

      const cells: Cell[] = []
      let deedIdx = 0
      for (let i = 0; i < 25; i++) {
        if (i === 12) {
          cells.push({
            index: 12, deed_text: 'I Dare Ya!',
            deed_text_long: 'Tap the centre square to take the I DARE YA challenge — you might win a little, lose a little, or get dared to refer a friend. The centre is a free space and always counts toward your Bingo.',
            deed_id: null, is_free_space: true, is_purchasable: false, purchase_price: null,
            is_referral_free: false, is_secret: false, secret_reward: null, quantity: 1,
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
          })
        }
      }

      // Check validated referrals to pre-mark referral squares
      const { data: validRefs } = await supabase
        .from('referrals').select('id').eq('user_id', user.sub).eq('is_validated', true)
      const allReferralPositions = cells.filter((c) => c.is_referral_free).map((c) => c.index)
      const referralCellIndices = (validRefs?.length ?? 0) > 0 ? allReferralPositions : []

      const { data: newCard, error: cardErr } = await supabase
        .from('player_cards')
        .insert({
          user_id: user.sub,
          week_year: weekYear,
          card_seed: seed,
          card_data: JSON.stringify(cells),
          win_condition: adminWinCondition,
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

      return jsonResponse({
        card_id: newCard.id,
        week_year: newCard.week_year,
        cells: sanitizeCells(cells, []),
        win_condition: adminWinCondition,
        completed_cells: [],
        purchased_cells: [],
        referral_cells: referralCellIndices,
        is_bingo: false,
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
          item_description: `Secret Square reward (+$${reward.toFixed(2)})`,
        })
        secretRewardAwarded = reward
        cell.secret_revealed = true
        cells[cell_index] = cell
      }

      completed.push(cell_index)
      const allCompleted = [...new Set([...completed, ...purchased, ...referral, ...freeSpaceIndices(cells)])]
      const isBingo = checkBingo(allCompleted, card.win_condition)

      await supabase.from('player_cards').update({
        card_data: JSON.stringify(cells),
        completed_cells: JSON.stringify(completed),
        is_bingo: isBingo,
        updated_at: new Date().toISOString(),
      }).eq('id', card_id)

      // Log the mark action
      await supabase.from('cell_mark_log').insert({
        user_id: user.sub,
        card_id,
        cell_index,
        action: 'mark',
        note: markNote,
      })

      // Impact Board: record the completed deed (best-effort, never blocks the mark)
      await recordCompletedDeed(supabase, {
        playerId: user.sub,
        sourceType: 'bingo_card',
        deedId: (cell as { deed_id?: number | null }).deed_id ?? null,
        cardId: card_id,
        cellIndex: cell_index,
        category: (cell as { category?: string | null }).category ?? null,
      })

      // First time the card reaches Bingo: enter draw + congratulate by email (best-effort).
      if (isBingo && !card.is_bingo) {
        await supabase.from('draw_entries').upsert(
          { user_id: user.sub, week_year: card.week_year },
          { onConflict: 'user_id,week_year', ignoreDuplicates: true }
        )
        if (user.email) {
          const tpl = bingoWinEmail((user.name as string | undefined) ?? null, winLabel(card.win_condition))
          await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html })
        }
      }

      // Update daily streak
      const streakResult = await updatePlayerStreak(supabase, user.sub)

      const resp: Record<string, unknown> = { success: true, completed_cells: completed, is_bingo: isBingo }
      if (secretRewardAwarded !== null) resp.secret_reward = secretRewardAwarded
      if (isBingo && !card.is_bingo) resp.draw_entered = true
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

      await supabase.from('player_cards').update({
        completed_cells: '[]',
        purchased_cells: '[]',
        referral_cells: '[]',
        is_bingo: false,
        updated_at: new Date().toISOString(),
      }).eq('id', card.id)

      return jsonResponse({
        success: true,
        card_id: card.id,
        week_year: card.week_year,
        cells: sanitizeCells(JSON.parse(card.card_data), []),
        win_condition: card.win_condition,
        completed_cells: [], purchased_cells: [], referral_cells: [], is_bingo: false, dare_clicks: 0,
      })
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
        return errorResponse(`Insufficient funds. Need $${price}, have $${balance.toFixed(2)}`, 400)
      }

      const newBalance = balance - price
      await supabase.from('player_wallets')
        .update({ balance: newBalance, updated_at: new Date().toISOString() }).eq('user_id', user.sub)
      await supabase.from('wallet_transactions').insert({
        user_id: user.sub,
        amount: -price,
        transaction_type: 'purchase',
        item_description: `Purchased bingo square: ${cell.deed_text} ($${price})`,
      })

      purchased.push(cell_index)
      const completed = parseJsonArr(card.completed_cells)
      const referral = parseJsonArr(card.referral_cells)
      const allCompleted = [...new Set([...completed, ...purchased, ...referral, ...freeSpaceIndices(cells)])]
      const isBingo = checkBingo(allCompleted, card.win_condition)

      await supabase.from('player_cards').update({
        purchased_cells: JSON.stringify(purchased),
        is_bingo: isBingo,
        updated_at: new Date().toISOString(),
      }).eq('id', card_id)

      // First time the card reaches Bingo: enter draw + congratulate by email (best-effort).
      if (isBingo && !card.is_bingo) {
        await supabase.from('draw_entries').upsert(
          { user_id: user.sub, week_year: card.week_year },
          { onConflict: 'user_id,week_year', ignoreDuplicates: true }
        )
        if (user.email) {
          const tpl = bingoWinEmail((user.name as string | undefined) ?? null, winLabel(card.win_condition))
          await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html })
        }
      }

      return jsonResponse({ success: true, purchased_cells: purchased, new_balance: newBalance, is_bingo: isBingo })
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
        item_description: `Added $${amount} to wallet`,
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
      await recordCompletedDeed(supabase, {
        playerId: user.sub,
        sourceType: 'quick_action',
        quickDeedId: deedId,
      })

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
        const deed = row.quick_deeds as { label: string; emoji: string } | null
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
        .select('id, first_name, last_name, username, player_number, city, province_state, country_id, challenge_level')

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

      const makeEntry = (u: typeof allUsers[0], deeds: number) => {
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

    // ── GET /public/prize ─────────────────────────────────────────────────────
    if (method === 'GET' && path === '/public/prize') {
      const { data: rows } = await supabase
        .from('game_configs').select('config_key, config_value')
        .in('config_key', ['prize_image_url', 'prize_title'])
      const cfg: Record<string, string> = {}
      for (const r of rows ?? []) cfg[r.config_key] = r.config_value ?? ''
      return jsonResponse({ prize_image_url: cfg['prize_image_url'] ?? '', prize_title: cfg['prize_title'] ?? "This Week's Prize" })
    }

    // ── POST /admin/verify ────────────────────────────────────────────────────
    if (method === 'POST' && path === '/admin/verify') {
      const body = await req.json()
      const { data: cfg } = await supabase
        .from('game_configs').select('config_value').eq('config_key', 'admin_password').maybeSingle()
      if (!cfg || cfg.config_value !== body.password) {
        return errorResponse('Invalid admin password', 403)
      }
      return jsonResponse({ success: true })
    }

    // ── GET /admin/config ─────────────────────────────────────────────────────
    if (method === 'GET' && path === '/admin/config') {
      const { data } = await supabase.from('game_configs').select('*')
      const configs: Record<string, { value: string; description: string }> = {}
      for (const c of data ?? []) configs[c.config_key] = { value: c.config_value ?? '', description: c.description ?? '' }
      return jsonResponse({ configs })
    }

    // ── POST /admin/config ────────────────────────────────────────────────────
    if (method === 'POST' && path === '/admin/config') {
      const body = await req.json()
      for (const [key, value] of Object.entries(body.configs ?? {})) {
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
          dare_clicks: card.dare_clicks ?? 0,
        } : null,
      })
    }

    // ── GET /admin/members ────────────────────────────────────────────────────
    if (method === 'GET' && path === '/admin/members') {
      const { data } = await supabase
        .from('users')
        .select('id, email, username, name, first_name, last_name, role, challenge_level, province_state, country, city, country_id, state_id, player_number, last_login, profile_completed')
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
          challenge_level: u.challenge_level ?? null,
          province_state: u.province_state ?? null,
          country: u.country ?? null,
          city: u.city ?? null,
          country_id: u.country_id ?? null,
          state_id: u.state_id ?? null,
          player_number: u.player_number ?? null,
          last_login: u.last_login ?? null,
          profile_completed: !!u.profile_completed,
        })),
      })
    }

    // ── GET /admin/deeds ──────────────────────────────────────────────────────
    if (method === 'GET' && path === '/admin/deeds') {
      const { data } = await supabase.from('good_deeds').select('*').order('id')
      return jsonResponse({
        deeds: (data ?? []).map((d) => ({
          id: d.id, deed_text: d.deed_text, deed_text_long: d.deed_text_long ?? null,
          category: d.category, is_active: d.is_active, complexity: d.complexity ?? null,
          quantity: d.quantity ?? 1,
        })),
      })
    }

    // ── POST /admin/deeds ─────────────────────────────────────────────────────
    if (method === 'POST' && path === '/admin/deeds') {
      const body = await req.json()
      const { data, error } = await supabase.from('good_deeds').insert({
        deed_text: body.deed_text ?? '',
        deed_text_long: body.deed_text_long || null,
        category: body.category ?? '',
        is_active: body.is_active ?? true,
        complexity: body.complexity != null ? Number(body.complexity) : null,
        quantity: body.quantity != null ? Math.max(1, Math.round(Number(body.quantity)) || 1) : 1,
      }).select().single()
      if (error) throw error
      return jsonResponse({ id: data.id, deed_text: data.deed_text, deed_text_long: data.deed_text_long, category: data.category, is_active: data.is_active, complexity: data.complexity ?? null, quantity: data.quantity ?? 1 })
    }

    // ── POST /admin/deeds/import ──────────────────────────────────────────────
    if (method === 'POST' && path === '/admin/deeds/import') {
      const body = await req.json()
      const rows: Array<{ id?: number; deed_text?: string; deed_text_long?: string | null; category?: string; complexity?: number | null; quantity?: number | null; is_active?: unknown }> = body.deeds ?? []
      let updated = 0, created = 0, skipped = 0

      // Build a lookup of existing deeds by lowercased text so an upload with a
      // blank id matches an existing deed by NAME instead of creating a duplicate.
      const { data: allDeeds } = await supabase.from('good_deeds').select('id, deed_text')
      const idByText = new Map<string, number>()
      for (const d of allDeeds ?? []) {
        idByText.set(String(d.deed_text ?? '').trim().toLowerCase(), d.id)
      }

      // Robustly interpret is_active for both booleans and strings of any case.
      const parseActive = (v: unknown): boolean => {
        if (v === false) return false
        const s = String(v ?? '').trim().toLowerCase()
        return !(s === 'false' || s === '0' || s === 'no' || s === 'n')
      }

      // Clamp quantity to the allowed 1–4 range; default to 1.
      const parseQuantity = (v: unknown): number => {
        const n = Number(v)
        if (!Number.isFinite(n)) return 1
        return Math.max(1, Math.round(n))
      }

      for (const row of rows) {
        const text = String(row.deed_text ?? '').trim()
        if (!text) { skipped++; continue }
        const complexityVal = (row.complexity != null && String(row.complexity).trim() !== '')
          ? (Number(row.complexity) || null)
          : null
        const payload = {
          deed_text: text,
          deed_text_long: row.deed_text_long ? String(row.deed_text_long).trim() || null : null,
          category: row.category ? String(row.category).trim() : null,
          complexity: complexityVal,
          quantity: parseQuantity(row.quantity),
          is_active: parseActive(row.is_active),
        }

        // Determine the target row: explicit id wins, else match by name.
        const explicitId = row.id ? Number(row.id) : 0
        const matchedId = explicitId > 0 ? explicitId : (idByText.get(text.toLowerCase()) ?? 0)

        if (matchedId > 0) {
          const { error } = await supabase.from('good_deeds').update(payload).eq('id', matchedId)
          if (!error) updated++; else skipped++
        } else {
          const { data: inserted, error } = await supabase.from('good_deeds').insert(payload).select('id').single()
          if (!error) {
            created++
            // Track the new deed so duplicate rows within the same file update it.
            if (inserted) idByText.set(text.toLowerCase(), inserted.id)
          } else {
            skipped++
          }
        }
      }
      return jsonResponse({ success: true, updated, created, skipped, total: updated + created })
    }

    // ── PUT /admin/deeds/:id ──────────────────────────────────────────────────
    const deedPutMatch = matchPath('/admin/deeds/:id', path)
    if (method === 'PUT' && deedPutMatch) {
      const body = await req.json()
      const updates: Record<string, unknown> = {}
      if ('deed_text' in body) updates.deed_text = body.deed_text
      if ('deed_text_long' in body) updates.deed_text_long = body.deed_text_long || null
      if ('category' in body) updates.category = body.category
      if ('is_active' in body) updates.is_active = body.is_active
      if ('complexity' in body) updates.complexity = body.complexity != null ? Number(body.complexity) : null
      if ('quantity' in body) updates.quantity = body.quantity != null ? Math.max(1, Math.round(Number(body.quantity)) || 1) : 1
      const { data, error } = await supabase.from('good_deeds')
        .update(updates).eq('id', parseInt(deedPutMatch.id)).select().maybeSingle()
      if (error) throw error
      if (!data) return errorResponse('Deed not found', 404)
      return jsonResponse({ id: data.id, deed_text: data.deed_text, deed_text_long: data.deed_text_long, category: data.category, is_active: data.is_active, complexity: data.complexity ?? null, quantity: data.quantity ?? 1 })
    }

    // ── DELETE /admin/deeds/:id ───────────────────────────────────────────────
    const deedDeleteMatch = matchPath('/admin/deeds/:id', path)
    if (method === 'DELETE' && deedDeleteMatch) {
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

      const claimsByWeek: Record<string, typeof claims[0]> = {}
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
      const { data: pending } = await supabase.from('pending_deeds')
        .select('*').eq('id', parseInt(approveMatch.id)).maybeSingle()
      if (!pending) return errorResponse('Pending deed not found', 404)
      if (pending.status === 'approved') return errorResponse('Already approved', 400)
      const { data: newDeed, error } = await supabase.from('good_deeds').insert({
        deed_text: pending.deed_text, deed_text_long: null,
        category: pending.category ?? 'Community', is_active: true,
      }).select().single()
      if (error) throw error
      await supabase.from('pending_deeds').update({ status: 'approved' }).eq('id', pending.id)
      return jsonResponse({ success: true, message: 'Deed approved and added to the active pool.', deed: { id: newDeed.id, deed_text: newDeed.deed_text, deed_text_long: null, category: newDeed.category, is_active: true } })
    }

    // ── POST /admin/pending-deeds/:id/reject ──────────────────────────────────
    const rejectMatch = matchPath('/admin/pending-deeds/:id/reject', path)
    if (method === 'POST' && rejectMatch) {
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
        const tpl = gameAnnouncementEmail({ name: displayName, prize, gameType: game_type, theme, extraMessage: extra_message })
        const result = await sendEmail({ to: player.email, subject: tpl.subject, html: tpl.html })
        if (result.sent) sent++
        else failed++
      }

      return jsonResponse({ success: true, sent, failed })
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
        item_description: `Added $${walletAmount.toFixed(2)} to wallet`,
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
      const body = await req.json()
      const { status } = body
      if (!['pending', 'contacted', 'fulfilled', 'rejected'].includes(status)) {
        return errorResponse('Invalid status', 400)
      }
      const { error } = await supabase.from('prize_claims')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', parseInt(claimMatch.id))
      if (error) throw error
      return jsonResponse({ success: true })
    }

    // ── GET /admin/draw-results ───────────────────────────────────────────────
    if (method === 'GET' && path === '/admin/draw-results') {
      requireAdmin(authUser)
      const { data: winners } = await supabase
        .from('draw_winners')
        .select('id, user_id, week_year, selected_at, odds_weight, users!inner(first_name, name, username, email)')
        .order('selected_at', { ascending: false })
        .limit(20)
      const { data: entryCounts } = await supabase
        .from('draw_entries')
        .select('week_year')
      const countByWeek: Record<string, number> = {}
      for (const e of entryCounts ?? []) {
        countByWeek[e.week_year] = (countByWeek[e.week_year] ?? 0) + 1
      }
      return jsonResponse({
        winners: (winners ?? []).map((w: any) => ({
          id: w.id,
          user_id: w.user_id,
          week_year: w.week_year,
          selected_at: w.selected_at,
          odds_weight: w.odds_weight,
          name: w.users?.first_name ?? w.users?.name ?? w.users?.username ?? null,
          email: w.users?.email ?? null,
          total_entries: countByWeek[w.week_year] ?? 0,
        })),
      })
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

    // ── POST /dare-spin ───────────────────────────────────────────────────────
    // Spin the Dare wheel for the current player's active card.
    //
    // Confirmed design rules (hardcoded, not admin-toggleable):
    //   1. No negative balance — ever. If remove_funds would take the wallet
    //      below $0.00, re-roll until a non-remove_funds outcome is selected.
    //   2. swap_square always un-marks the swapped cell. The player must complete
    //      the new deed before the square counts.
    //   3. Dare clicks are per-week per-card. dare_clicks lives on player_cards
    //      which has one row per player per week, so it resets automatically when
    //      a new card is generated.
    if (method === 'POST' && path === '/dare-spin') {
      const user = requireAuth(authUser)
      const body = await req.json()
      const { card_id } = body

      // Load the player's card
      const { data: card } = await supabase
        .from('player_cards').select('*')
        .eq('id', card_id).eq('user_id', user.sub).maybeSingle()
      if (!card) return errorResponse('Card not found', 404)

      // Hardcoded: 1 dare spin per card per week (resets automatically with new card)
      const maxSpins = 1
      const dareClicks: number = card.dare_clicks ?? 0
      if (dareClicks >= maxSpins) {
        return errorResponse('You have already used your Dare Spin for this week', 400)
      }

      // Check dare_enabled
      const { data: enabledCfg } = await supabase
        .from('game_configs').select('config_value')
        .eq('config_key', 'dare_enabled').maybeSingle()
      if (enabledCfg?.config_value === 'false') {
        return errorResponse('Dare Spin is currently disabled', 400)
      }

      // ── Load outcome weights from game_configs ──────────────────────────────
      // Keys that start with dare_outcome_* each have format "weight:amount"
      const { data: cfgRows } = await supabase
        .from('game_configs').select('config_key, config_value')
        .like('config_key', 'dare_outcome_%')

      type OutcomeType = 'add_funds' | 'remove_funds' | 'swap_square' | 'refer_player' | 'nothing'
      interface Outcome { type: OutcomeType; label: string; weight: number; amount: number }

      const typeMap: Record<string, OutcomeType> = {
        'dare_outcome_add_funds_2':  'add_funds',
        'dare_outcome_add_funds_1':  'add_funds',
        'dare_outcome_add_funds_50': 'add_funds',
        'dare_outcome_remove_funds': 'remove_funds',
        'dare_outcome_refer_player': 'refer_player',
        'dare_outcome_swap_square':  'swap_square',
        'dare_outcome_nothing':      'nothing',
      }
      const labelMap: Record<string, string> = {
        'dare_outcome_add_funds_2':  '+$2.00',
        'dare_outcome_add_funds_1':  '+$1.00',
        'dare_outcome_add_funds_50': '+$0.50',
        'dare_outcome_remove_funds': '-$0.50',
        'dare_outcome_refer_player': 'Refer a Player!',
        'dare_outcome_swap_square':  'Surprise Deed!',
        'dare_outcome_nothing':      'No Effect',
      }

      const outcomes: Outcome[] = []
      for (const row of (cfgRows ?? [])) {
        const type = typeMap[row.config_key]
        if (!type) continue
        const [wStr, aStr] = (row.config_value ?? '0:0').split(':')
        const weight = parseInt(wStr ?? '0') || 0
        const amount = parseFloat(aStr ?? '0') || 0
        if (weight <= 0) continue
        outcomes.push({ type, label: labelMap[row.config_key] ?? type, weight, amount })
      }

      if (outcomes.length === 0) {
        return errorResponse('No dare outcomes configured', 500)
      }

      // ── Weighted random selection ───────────────────────────────────────────
      // Uses crypto.getRandomValues for genuine randomness (not seeded).
      function pickOutcome(pool: Outcome[]): Outcome {
        const totalWeight = pool.reduce((s, o) => s + o.weight, 0)
        const randBuf = new Uint32Array(1)
        crypto.getRandomValues(randBuf)
        let roll = (randBuf[0] / 4_294_967_296) * totalWeight
        for (const o of pool) {
          roll -= o.weight
          if (roll <= 0) return o
        }
        return pool[pool.length - 1]
      }

      // Load wallet balance for negative-balance check
      let { data: wallet } = await supabase
        .from('player_wallets').select('*').eq('user_id', user.sub).maybeSingle()
      if (!wallet) {
        const { data: w } = await supabase
          .from('player_wallets').insert({ user_id: user.sub, balance: 0 }).select().single()
        wallet = w
      }
      const currentBalance = parseFloat(wallet.balance)

      // ── "Refer a Player" cadence (Curt's rule, table-driven) ────────────────
      // On the player's Nth dare spin (config dare_refer_forced_spin, default 3)
      // the spin is GUARANTEED to land on Refer a Player ("they've played N
      // times, clearly they enjoy it — now invite a friend"). On every other
      // spin, Refer a Player is just one weighted outcome (~15-20%, table-driven
      // via dare_outcome_refer_player). Set the threshold to 0 to disable forcing.
      const { data: spinUser } = await supabase
        .from('users').select('dare_total_spins').eq('id', user.sub).maybeSingle()
      const priorSpins: number = spinUser?.dare_total_spins ?? 0
      const thisSpinNumber = priorSpins + 1
      const { data: forcedCfg } = await supabase
        .from('game_configs').select('config_value')
        .eq('config_key', 'dare_refer_forced_spin').maybeSingle()
      const forcedReferSpin = parseInt(forcedCfg?.config_value ?? '3') || 0

      // Pick outcome.
      let chosen: Outcome
      if (forcedReferSpin > 0 && thisSpinNumber === forcedReferSpin) {
        chosen = outcomes.find((o) => o.type === 'refer_player')
          ?? { type: 'refer_player', label: 'Refer a Player!', weight: 1, amount: 0 }
      } else {
        chosen = pickOutcome(outcomes)
        // Rule 1: if remove_funds would take the wallet negative, re-roll to a
        // non-remove_funds outcome (hardcoded, not configurable).
        if (chosen.type === 'remove_funds' && currentBalance - chosen.amount < 0) {
          const safePool = outcomes.filter((o) => o.type !== 'remove_funds')
          chosen = safePool.length > 0
            ? pickOutcome(safePool)
            : { type: 'nothing', label: 'No Effect', weight: 1, amount: 0 }
        }
      }

      // ── Execute the chosen outcome ──────────────────────────────────────────
      const cells: Cell[] = JSON.parse(card.card_data)
      const completed = parseJsonArr(card.completed_cells)
      const purchased = parseJsonArr(card.purchased_cells)
      const referral = parseJsonArr(card.referral_cells)

      let newBalance = currentBalance
      const result: Record<string, unknown> = { outcome: chosen.type, label: chosen.label, amount: chosen.amount }

      if (chosen.type === 'add_funds') {
        newBalance = currentBalance + chosen.amount
        await supabase.from('player_wallets')
          .update({ balance: newBalance, updated_at: new Date().toISOString() })
          .eq('user_id', user.sub)
        await supabase.from('wallet_transactions').insert({
          user_id: user.sub,
          amount: chosen.amount,
          transaction_type: 'dare_reward',
          item_description: `Dare Spin reward (+$${chosen.amount.toFixed(2)})`,
        })
        result.new_balance = newBalance

      } else if (chosen.type === 'remove_funds') {
        // Rule 1 already guaranteed this won't go negative.
        newBalance = Math.max(0, currentBalance - chosen.amount)
        await supabase.from('player_wallets')
          .update({ balance: newBalance, updated_at: new Date().toISOString() })
          .eq('user_id', user.sub)
        await supabase.from('wallet_transactions').insert({
          user_id: user.sub,
          amount: -chosen.amount,
          transaction_type: 'dare_penalty',
          item_description: `Dare Spin penalty (-$${chosen.amount.toFixed(2)})`,
        })
        result.new_balance = newBalance

      } else if (chosen.type === 'swap_square') {
        // Pick a random uncompleted, non-special cell to swap.
        // "Uncompleted" means not in completed, purchased, or referral arrays.
        const allMarked = new Set([...completed, ...purchased, ...referral])
        const swappableCells = cells.filter(
          (c) => !c.is_free_space && !c.is_purchasable && !c.is_referral_free && !allMarked.has(c.index)
        )
        if (swappableCells.length === 0) {
          // No eligible cells — fall back to nothing
          result.outcome = 'nothing'
          result.swap_skipped_reason = 'no_eligible_cells'
        } else {
          // Pick a random cell from swappable pool
          const randBuf2 = new Uint32Array(1)
          crypto.getRandomValues(randBuf2)
          const swapIdx = Math.floor((randBuf2[0] / 4_294_967_296) * swappableCells.length)
          const targetCell = swappableCells[swapIdx]

          // Fetch a replacement deed that isn't already on the card
          const existingDeedIds = new Set(cells.map((c) => c.deed_id).filter((id): id is number => id != null))
          const { data: replacementDeeds } = await supabase
            .from('good_deeds').select('*').eq('is_active', true)
          const eligible = (replacementDeeds ?? []).filter((d) => !existingDeedIds.has(d.id))

          if (eligible.length === 0) {
            result.outcome = 'nothing'
            result.swap_skipped_reason = 'no_replacement_deeds'
          } else {
            const randBuf3 = new Uint32Array(1)
            crypto.getRandomValues(randBuf3)
            const newDeed = eligible[Math.floor((randBuf3[0] / 4_294_967_296) * eligible.length)]

            // Swap the cell deed
            cells[targetCell.index] = {
              ...targetCell,
              deed_text: newDeed.deed_text,
              deed_text_long: newDeed.deed_text_long ?? null,
              deed_id: newDeed.id,
              quantity: newDeed.quantity ?? 1,
              is_secret: false,
              secret_reward: null,
              secret_revealed: false,
            }

            // Rule 2: swap_square ALWAYS un-marks the swapped cell.
            // Remove it from completed_cells so the player must complete the new deed.
            const updatedCompleted = completed.filter((i) => i !== targetCell.index)
            const allCompleted = [...new Set([...updatedCompleted, ...purchased, ...referral, ...freeSpaceIndices(cells)])]
            const isBingo = checkBingo(allCompleted, card.win_condition)

            await supabase.from('player_cards').update({
              card_data: JSON.stringify(cells),
              completed_cells: JSON.stringify(updatedCompleted),
              is_bingo: isBingo,
              updated_at: new Date().toISOString(),
            }).eq('id', card_id)

            result.swapped_cell_index = targetCell.index
            result.old_deed = targetCell.deed_text
            result.new_deed = newDeed.deed_text
            result.completed_cells = updatedCompleted
            result.is_bingo = isBingo
          }
        }

      } else if (chosen.type === 'refer_player') {
        // No game state change — frontend shows the referral UI
        result.outcome = 'refer_player'
        result.message = 'Refer a new player to unlock this square!'

      } else if (chosen.type === 'mark_random') {
        // Auto-mark a random uncompleted, non-special cell.
        const allMarked2 = new Set([...completed, ...purchased, ...referral])
        const markableCells = cells.filter(
          (c) => !c.is_purchasable && !c.is_referral_free && !c.is_free_space && !allMarked2.has(c.index)
        )
        if (markableCells.length === 0) {
          result.outcome = 'nothing'
          result.mark_skipped_reason = 'no_eligible_cells'
        } else {
          const randBuf4 = new Uint32Array(1)
          crypto.getRandomValues(randBuf4)
          const markCell = markableCells[Math.floor((randBuf4[0] / 4_294_967_296) * markableCells.length)]
          const updatedCompleted2 = [...completed, markCell.index]
          const allCompleted2 = [...new Set([...updatedCompleted2, ...purchased, ...referral, ...freeSpaceIndices(cells)])]
          const isBingo2 = checkBingo(allCompleted2, card.win_condition)

          await supabase.from('player_cards').update({
            completed_cells: JSON.stringify(updatedCompleted2),
            is_bingo: isBingo2,
            updated_at: new Date().toISOString(),
          }).eq('id', card_id)

          // First time reaching bingo via dare: enter draw + send email (best-effort)
          if (isBingo2 && !card.is_bingo) {
            await supabase.from('draw_entries').upsert(
              { user_id: user.sub, week_year: card.week_year },
              { onConflict: 'user_id,week_year', ignoreDuplicates: true }
            )
            if (user.email) {
              const tpl = bingoWinEmail((user.name as string | undefined) ?? null, winLabel(card.win_condition))
              await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html })
            }
          }

          result.marked_cell_index = markCell.index
          result.marked_deed = markCell.deed_text
          result.completed_cells = updatedCompleted2
          result.is_bingo = isBingo2
        }

      } else {
        // nothing — no game state change
        result.message = 'No effect this time. Better luck next spin!'
      }

      // Increment dare_clicks regardless of outcome
      await supabase.from('player_cards')
        .update({ dare_clicks: dareClicks + 1, updated_at: new Date().toISOString() })
        .eq('id', card_id)

      // Increment the player's cumulative dare-spin count (drives the forced
      // "Refer a Player" cadence above — resets never; counts across weeks).
      await supabase.from('users')
        .update({ dare_total_spins: thisSpinNumber })
        .eq('id', user.sub)

      result.dare_clicks_used = dareClicks + 1
      result.dare_clicks_remaining = Math.max(0, maxSpins - (dareClicks + 1))
      return jsonResponse({ success: true, ...result })
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

    // ── GET /my-profile/details ───────────────────────────────────────────────
    if (method === 'GET' && path === '/my-profile/details') {
      const user = requireAuth(authUser)
      const { data: u } = await supabase
        .from('users')
        .select('first_name, last_name, username, email, city, country_id, state_id, challenge_level, player_number')
        .eq('id', user.sub)
        .maybeSingle()
      if (!u) return errorResponse('User not found', 404)
      return jsonResponse(u)
    }

    // ── PUT /my-profile ───────────────────────────────────────────────────────
    if (method === 'PUT' && path === '/my-profile') {
      const user = requireAuth(authUser)
      const body = await req.json()
      const { first_name, last_name, username, city, country_id, state_id, challenge_level } = body

      if (username) {
        const { data: existing } = await supabase
          .from('users').select('id').eq('username', username).neq('id', user.sub).maybeSingle()
        if (existing) return errorResponse('Username is already taken', 409)
      }
      if (challenge_level != null && (challenge_level < 1 || challenge_level > 5)) {
        return errorResponse('challenge_level must be between 1 and 5', 400)
      }

      await supabase.from('users').update({
        ...(first_name !== undefined && { first_name }),
        ...(last_name !== undefined && { last_name }),
        ...(username !== undefined && { username }),
        ...(city !== undefined && { city }),
        ...(country_id !== undefined && { country_id }),
        ...(state_id !== undefined && { state_id }),
        ...(challenge_level !== undefined && { challenge_level }),
      }).eq('id', user.sub)

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
      const body = await req.json()
      const { data: cfg } = await supabase
        .from('game_configs').select('config_value').eq('config_key', 'admin_password').maybeSingle()
      if (!cfg || cfg.config_value !== body.admin_password) return errorResponse('Invalid admin password', 403)

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
      if (error) throw error
      return jsonResponse({ success: true, user_id: userId })
    }

    // ── PUT /admin/players/:id ────────────────────────────────────────────────
    const adminPlayerPutMatch = method === 'PUT' && path.match(/^\/admin\/players\/([^/]+)$/)
    if (adminPlayerPutMatch) {
      const targetId = adminPlayerPutMatch[1]
      const body = await req.json()
      const { data: cfg } = await supabase
        .from('game_configs').select('config_value').eq('config_key', 'admin_password').maybeSingle()
      if (!cfg || cfg.config_value !== body.admin_password) return errorResponse('Invalid admin password', 403)

      const { first_name, last_name, email, username, city, country_id, state_id, challenge_level, role } = body

      if (email) {
        const { data: existing } = await supabase.from('users').select('id').eq('email', email).neq('id', targetId).maybeSingle()
        if (existing) return errorResponse('Email already in use', 409)
      }
      if (username) {
        const { data: existing } = await supabase.from('users').select('id').eq('username', username).neq('id', targetId).maybeSingle()
        if (existing) return errorResponse('Username already taken', 409)
      }

      await supabase.from('users').update({
        ...(first_name !== undefined && { first_name }),
        ...(last_name !== undefined && { last_name }),
        ...(email !== undefined && { email }),
        ...(username !== undefined && { username }),
        ...(city !== undefined && { city }),
        ...(country_id !== undefined && { country_id }),
        ...(state_id !== undefined && { state_id }),
        ...(challenge_level !== undefined && { challenge_level }),
        ...(role !== undefined && { role }),
      }).eq('id', targetId)

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
        .from('users').select('username, name, current_streak_days')
        .gt('current_streak_days', 0)
        .order('current_streak_days', { ascending: false })
        .limit(20)
      const { data: longest } = await supabase
        .from('users').select('username, name, longest_streak_days')
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

    // ── DELETE /admin/players/:id ─────────────────────────────────────────────
    const adminPlayerDeleteMatch = method === 'DELETE' && path.match(/^\/admin\/players\/([^/]+)$/)
    if (adminPlayerDeleteMatch) {
      const targetId = adminPlayerDeleteMatch[1]
      const adminPw = new URL(req.url).searchParams.get('admin_password')
      const { data: cfg } = await supabase
        .from('game_configs').select('config_value').eq('config_key', 'admin_password').maybeSingle()
      if (!cfg || cfg.config_value !== adminPw) return errorResponse('Invalid admin password', 403)

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
