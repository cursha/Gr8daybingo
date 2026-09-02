import { handleCors, jsonResponse, errorResponse, corsHeaders } from '../_shared/cors.ts'
import { getAuthUser, requireAuth, requireAdmin } from '../_shared/auth.ts'
import { getSupabase, getSubPath, matchPath } from '../_shared/db.ts'
import { getClientIp } from '../_shared/rate_limit.ts'
import { sendEmail, passwordResetEmail, adminLockoutEmail, adminPasswordResetEmail, referralInviteEmail, bingoWinEmail, prizeClaimConfirmationEmail, prizeVoucherEmail, gameAnnouncementEmail, newGameLaunchEmail } from '../_shared/email.ts'
import { callAnthropicForText } from '../_shared/anthropic.ts'
import {
  getDrawSettings, awardDeedEntry, awardPatternBonus,
  reverseDeedEntry, reversePatternBonus, manualAdjust, runWeeklyDraw,
} from '../_shared/draw.ts'
// Bingo win/pattern detection is pure logic with no DB or network calls, so
// it lives in its own module where it can be unit-tested directly — see
// supabase/tests/bingo_logic.test.ts. Same pattern as draw_logic.ts.
import {
  LINES, completedLineIndices, checkBingo,
  PATTERN_NOMINAL_SQUARES, ALL_SCORING_PATTERNS, PATTERN_FIXED_CELLS,
  isPatternComplete, realSquaresForPattern, newlySatisfiedPatterns,
} from '../_shared/bingo_logic.ts'
import { getCurrentWeekYear, getWeekStart } from '../_shared/week.ts'
import { Cell, dareYaField, parseJsonArr, parseJsonStrArr, freeSpaceIndices, getPlayerCurrentCard, sanitizeCells } from '../_shared/card_helpers.ts'
import { recordCompletedDeed, checkDeedGate, updatePlayerStreak } from '../_shared/deed_completion.ts'
import { reverseCellCompletion } from '../_shared/deed_reversal.ts'
import { getBadge } from '../_shared/badges.ts'
import { fetchTargetingData, filterDeedsByTargeting } from '../_shared/targeting.ts'
import { awardBingoPatterns } from '../_shared/bingo_award.ts'
// Extracted route-group modules — see routes/README pattern in each file's
// header comment. Each handler tries its own routes and returns null if
// none matched, letting the main dispatcher below fall through to the next.
import { handleAdminDeedLogRoutes } from './routes/admin_deed_log.ts'
import { handlePublicStatsRoutes } from './routes/public_stats.ts'
import { handleDareYaRoutes } from './routes/dare_ya.ts'
import { handleAdminAnnounceRoutes } from './routes/admin_announce.ts'
import { handleWalletRoutes } from './routes/wallet.ts'
import { handleQuickTapRoutes } from './routes/quick_tap.ts'
import { handleCardPickupPromptsRoutes } from './routes/card_pickup_prompts.ts'
import { handleAdminDrawResultsRoutes } from './routes/admin_draw_results.ts'
import { handleStreaksRoutes } from './routes/streaks.ts'
import { handleAdminDeedsRoutes } from './routes/admin_deeds.ts'
import { handlePrizesRoutes } from './routes/prizes.ts'
import { handleAdminConfigRoutes } from './routes/admin_config.ts'
import { handleTeamsTradesRoutes } from './routes/teams_trades.ts'
import { handleProfilesRoutes } from './routes/profiles.ts'
import bcrypt from 'npm:bcryptjs@2'

// ── Types ────────────────────────────────────────────────────────────────────
// Cell, dareYaField, parseJsonArr, parseJsonStrArr, and freeSpaceIndices all
// live in _shared/card_helpers.ts now (imported at the top of this file) —
// they're used across nearly every route, including the extracted ones.

// ── Helpers ──────────────────────────────────────────────────────────────────
// A card must be at least this old before the player can tap out of it.
// Bingo completion does NOT shortcut this — winning behaves exactly as it
// always has (pays the bonus, lets them keep playing the same card); the
// only path to a new card is tapping out once it's old enough.
const TAP_OUT_MIN_DAYS = 7

// Same rule for both game modes — Blackout's own reveal/pause/pass
// mechanics are untouched, but it gets the same tap-out gate as classic.
function getTapOutEligibility(card: { created_at: string }): {
  can_tap_out: boolean
  tap_out_eligible_at: string
} {
  const eligibleAt = new Date(new Date(card.created_at).getTime() + TAP_OUT_MIN_DAYS * 24 * 60 * 60 * 1000)
  return {
    can_tap_out: Date.now() >= eligibleAt.getTime(),
    tap_out_eligible_at: eligibleAt.toISOString(),
  }
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

function cryptoRandFloat01(): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] / 4_294_967_296
}

function cryptoRandInt(min: number, max: number): number {
  return min + Math.floor(cryptoRandFloat01() * (max - min + 1))
}

function cryptoShuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = cryptoRandInt(0, i)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

type ChallengeLevel = 1 | 3 | 5

/** Challenge Level (Easy/Medium/Hard): weight deed selection toward the
 * player's chosen good_deeds.complexity without excluding the other tiers
 * entirely — 70% target level / 20% adjacent / 10% far, so a card still has
 * variety and picking Hard doesn't mean zero easy wins. Deeds with no
 * complexity set are treated as Medium (3) so ungraded legacy deeds stay
 * eligible everywhere. Falls back to filling from any tier if the target
 * tier is too thin to reach `count` on its own. */
function selectWeightedDeeds<T extends { id: number; complexity?: number | null }>(
  deeds: T[], level: ChallengeLevel, count: number, rng: SeededRandom,
): T[] {
  const buckets: Record<ChallengeLevel, T[]> = { 1: [], 3: [], 5: [] }
  for (const d of deeds) {
    const c: ChallengeLevel = d.complexity === 1 ? 1 : d.complexity === 5 ? 5 : 3
    buckets[c].push(d)
  }
  for (const tier of [1, 3, 5] as const) rng.shuffle(buckets[tier])

  const far: ChallengeLevel = level === 1 ? 5 : level === 5 ? 1 : 5
  const tierOrder: ChallengeLevel[] = level === 3 ? [3, 1, 5] : [level, 3, far]
  const targetCount = Math.round(count * 0.7)
  const adjacentCount = Math.round(count * (level === 3 ? 0.15 : 0.2))
  const tierCounts = [targetCount, adjacentCount, count - targetCount - adjacentCount]

  const picked: T[] = []
  const pickedIds = new Set<number>()
  tierOrder.forEach((tier, i) => {
    let need = tierCounts[i]
    for (const d of buckets[tier]) {
      if (need <= 0 || picked.length >= count) break
      if (pickedIds.has(d.id)) continue
      picked.push(d); pickedIds.add(d.id); need--
    }
  })

  // Backfill if a tier came up short (e.g. not enough Hard deeds seeded yet):
  // target level first, then Medium, then whatever's left.
  if (picked.length < count) {
    for (const tier of [level, 3, 1, 5] as const) {
      for (const d of buckets[tier]) {
        if (picked.length >= count) break
        if (pickedIds.has(d.id)) continue
        picked.push(d); pickedIds.add(d.id)
      }
      if (picked.length >= count) break
    }
  }

  rng.shuffle(picked)
  return picked.slice(0, count)
}

/** Bomb Square trigger: a full, genuinely-random reroll of every square on a
 *  classic card — new deeds, new purchasable/secret/bomb positions, a fresh
 *  I Dare Ya roll. Deliberately NOT the seeded per-(player,week) RNG that
 *  /generate-card uses — reusing that seed would just rebuild the identical
 *  card, and "instantly rewritten" needs an actually different one. Mirrors
 *  the classic branch of /generate-card's cell-building; kept as its own
 *  function rather than shared, since that path is deterministic-seed-
 *  sensitive in a way this one deliberately isn't. Blackout has no bomb
 *  squares (no special squares at all), so this is classic-only. */
async function regenerateClassicCard(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
  winCondition: string,
): Promise<{ cells: Cell[]; referralCellIndices: number[] }> {
  const { data: activeCategories } = await supabase
    .from('deed_categories').select('name').eq('is_active', true)
  const activeCategoryNames = (activeCategories ?? []).map((c) => c.name)

  let deedQuery = supabase.from('good_deeds').select('*').eq('is_active', true).eq('status', 'Approved')
  if (activeCategoryNames.length > 0) deedQuery = deedQuery.in('category', activeCategoryNames)
  const { data: deeds } = await deedQuery
  if (!deeds || deeds.length < 24) throw { status: 400, detail: 'Not enough active deeds to rebuild the card' }

  const { playerValueIds, deedTargetingMap } = await fetchTargetingData(supabase, userId)
  const targetedDeeds = filterDeedsByTargeting(deeds, playerValueIds, deedTargetingMap, deeds)
  const deedList = [...targetedDeeds]
  cryptoShuffle(deedList)
  const selectedDeeds = deedList.slice(0, 24)

  const { data: cfgRows } = await supabase.from('game_configs').select('config_key, config_value')
  const cfg: Record<string, string> = {}
  for (const r of cfgRows ?? []) cfg[r.config_key] = r.config_value ?? ''
  const dollar1Pct = parseInt(cfg['dollar1_pct'] ?? '50')
  const dollar2Pct = parseInt(cfg['dollar2_pct'] ?? '30')
  const secret1Pct = parseInt(cfg['secret_reward_1_pct'] ?? '50')
  const secret2Pct = parseInt(cfg['secret_reward_2_pct'] ?? '30')
  const bombPct = parseInt(cfg['bomb_square_probability_pct'] ?? '1')

  const purchasableCount = cryptoRandInt(1, 3)
  const availablePos = Array.from({ length: 25 }, (_, i) => i).filter((i) => i !== 12)
  cryptoShuffle(availablePos)
  const purchasablePos = availablePos.slice(0, purchasableCount)
  const remaining = availablePos.slice(purchasableCount)
  const secretPosition: number | null = remaining.length > 0 ? remaining[0] : null

  let secretReward: number | null = null
  if (secretPosition !== null) {
    const roll = cryptoRandInt(1, 100)
    secretReward = roll <= secret1Pct ? 1.0 : roll <= secret1Pct + secret2Pct ? 2.0 : 5.0
  }

  const bombEligible = availablePos.filter((p) => !purchasablePos.includes(p) && p !== secretPosition)
  const bombPosition: number | null =
    cryptoRandInt(1, 100) <= bombPct && bombEligible.length > 0 ? bombEligible[0] : null

  const prices: number[] = purchasablePos.map(() => {
    const roll = cryptoRandInt(1, 100)
    return roll <= dollar1Pct ? 0.5 : roll <= dollar1Pct + dollar2Pct ? 1.0 : 2.0
  })

  interface DareYaRow {
    id: number; label: string; odds_percent: number; action_type: string
    credit_amount: number; remove_amount: number; reward_amount: number
  }
  let dareYaOutcomeType: string | null = null
  let dareYaLabel: string | null = null
  let dareYaActionValue: number | null = null
  if (winCondition !== 'fill_card') {
    const { data: dareYaRows } = await supabase
      .from('dare_ya_outcomes').select('id, label, odds_percent, action_type, credit_amount, remove_amount, reward_amount')
      .eq('is_active', true)
    const pool = (dareYaRows ?? []) as DareYaRow[]
    if (pool.length > 0) {
      const total = pool.reduce((s, r) => s + Number(r.odds_percent), 0)
      let roll = cryptoRandFloat01() * total
      let picked = pool[pool.length - 1]
      for (const r of pool) {
        roll -= Number(r.odds_percent)
        if (roll <= 0) { picked = r; break }
      }
      dareYaOutcomeType = picked.action_type
      dareYaLabel = picked.label
      dareYaActionValue = picked.action_type === 'fund_credit' ? Number(picked.credit_amount)
        : picked.action_type === 'remove_funds' ? Number(picked.remove_amount)
        : picked.action_type === 'refer_friend' ? Number(picked.reward_amount)
        : 0
    }
  }

  const cells: Cell[] = []
  let deedIdx = 0
  for (let i = 0; i < 25; i++) {
    if (i === 12) {
      cells.push({
        index: 12, deed_text: 'I Dare Ya!',
        deed_text_long: 'Tap the centre square to take the I DARE YA challenge — you might win a little, lose a little, or get dared to refer a friend. The centre is a free space and always counts toward your Bingo.',
        deed_id: null, is_free_space: true, is_purchasable: false, purchase_price: null,
        is_referral_free: false, is_secret: false, secret_reward: null, is_bomb: false, quantity: 1, category: null,
        dare_ya_outcome_type: dareYaOutcomeType,
        dare_ya_label: dareYaLabel,
        dare_ya_action_value: dareYaActionValue,
        dare_ya_revealed: false,
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
        is_referral_free: false,
        is_secret: isSecret,
        secret_reward: isSecret ? secretReward : null,
        is_bomb: i === bombPosition,
        quantity: deed.quantity ?? 1,
        category: deed.category ?? null,
      })
    }
  }

  // referralFreeCount is currently 0 at generation (same as /generate-card),
  // so no square is ever flagged is_referral_free — nothing to pre-mark.
  return { cells, referralCellIndices: [] }
}

// Blackout equivalent of regenerateClassicCard — used by tap-out. No special
// squares at all (no free space, no purchasable/secret/bomb/dare-ya): every
// one of the 25 cells is a plain deed square, matching /generate-card's
// blackout branch exactly, just with true crypto randomness instead of the
// seeded RNG (this is a voluntary reset, not a deterministic weekly seed).
async function regenerateBlackoutCard(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
): Promise<{ cells: Cell[] }> {
  const { data: activeCategories } = await supabase
    .from('deed_categories').select('name').eq('is_active', true)
  const activeCategoryNames = (activeCategories ?? []).map((c) => c.name)

  let deedQuery = supabase.from('good_deeds').select('*').eq('is_active', true).eq('status', 'Approved')
  if (activeCategoryNames.length > 0) deedQuery = deedQuery.in('category', activeCategoryNames)
  const { data: deeds } = await deedQuery
  if (!deeds || deeds.length < 25) throw { status: 400, detail: 'Not enough active deeds to rebuild the card' }

  const { playerValueIds, deedTargetingMap } = await fetchTargetingData(supabase, userId)
  const targetedDeeds = filterDeedsByTargeting(deeds, playerValueIds, deedTargetingMap, deeds)
  const deedList = [...targetedDeeds]
  cryptoShuffle(deedList)
  const selectedDeeds = deedList.slice(0, 25)

  const cells: Cell[] = Array.from({ length: 25 }, (_, i) => ({
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

  return { cells }
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
          { id: 'one_line_or_corners', name: 'One Line or Four Corners', description: 'Complete a full line (horizontal or vertical) OR all four corners — whichever comes first' },
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
      const existing = await getPlayerCurrentCard(supabase, user.sub)
      const { data: boCfg } = await supabase
        .from('game_configs').select('config_value').eq('config_key', 'blackout_enabled').maybeSingle()
      const { data: userRow } = await supabase
        .from('users').select('challenge_level').eq('id', user.sub).maybeSingle()
      return jsonResponse({
        has_card: existing != null,
        blackout_offered: boCfg?.config_value === 'true',
        default_challenge_level: userRow?.challenge_level ?? 3,
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

      // Challenge Level (Easy=1/Medium=3/Hard=5) — always offered, unlike
      // Blackout which is admin-toggled. Invalid/missing input defaults to
      // Medium rather than rejecting the request.
      const rawChallengeLevel = Number(body.challenge_level)
      const challengeLevel: ChallengeLevel = rawChallengeLevel === 1 || rawChallengeLevel === 5 ? rawChallengeLevel : 3

      // Check for an existing (still-current) card — no longer scoped to
      // this calendar week; a card stays current until tap-out or bingo.
      const existing = await getPlayerCurrentCard(supabase, user.sub)

      if (existing) {
        let needsSave = false
        if (existing.win_condition !== adminWinCondition) {
          existing.win_condition = adminWinCondition
          needsSave = true
        }

        // card_data is a snapshot taken at generation time — every deed field,
        // including quantity, is frozen for the life of the card. An admin's
        // deed edits only affect the NEXT card a player generates.
        const cells: Cell[] = JSON.parse(existing.card_data)

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

        // Check if player is entered in THIS calendar week's draw — the real
        // current week, not the (possibly weeks-old) week their card was
        // created in.
        const { data: drawEntry } = await supabase
          .from('draw_entries').select('id').eq('user_id', user.sub).eq('week_year', getCurrentWeekYear()).maybeSingle()

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
          created_at: existing.created_at,
          game_mode: existing.game_mode ?? 'classic',
          card_level: existing.card_level ?? null,
          cells: sanitizeCells(cells, completedIdx, blackoutState?.hidden_cells),
          win_condition: existing.win_condition,
          completed_cells: completedIdx,
          purchased_cells: parseJsonArr(existing.purchased_cells),
          referral_cells: parseJsonArr(existing.referral_cells),
          is_bingo: existing.is_bingo ?? false,
          draw_entered: drawEntry != null,
          pick_three_used: existing.pick_three_used ?? false,
          blackout: blackoutState,
          ...getTapOutEligibility(existing),
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

      const deedList = selectWeightedDeeds(targetedDeeds, challengeLevel, deedsNeeded, rng)

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

        // Bomb Square: rare (default 1%), picked from whatever's left over
        // once purchasable/secret/referral positions are claimed. Tapping it
        // doesn't complete it like a normal deed — see /mark-cell.
        const bombPct = parseInt(cfg['bomb_square_probability_pct'] ?? '1')
        const bombEligible = availablePos.filter(
          (p) => !purchasablePos.includes(p) && p !== secretPosition && !referralPos.includes(p)
        )
        const bombPosition: number | null =
          rng.randint(1, 100) <= bombPct && bombEligible.length > 0 ? bombEligible[0] : null

        const prices: number[] = purchasablePos.map(() => {
          const roll = rng.randint(1, 100)
          return roll <= dollar1Pct ? 0.5 : roll <= dollar1Pct + dollar2Pct ? 1.0 : 2.0
        })

        // Snapshot one I Dare Ya outcome onto the center cell (classic modes only).
        // fill_card (blackout) leaves the center as a plain free space.
        interface DareYaRow {
          id: number; label: string; odds_percent: number; action_type: string
          credit_amount: number; remove_amount: number; reward_amount: number
        }
        let dareYaOutcomeType: string | null = null
        let dareYaLabel: string | null = null
        let dareYaActionValue: number | null = null
        if (adminWinCondition !== 'fill_card') {
          const { data: dareYaRows } = await supabase
            .from('dare_ya_outcomes').select('id, label, odds_percent, action_type, credit_amount, remove_amount, reward_amount')
            .eq('is_active', true)
          const pool = (dareYaRows ?? []) as DareYaRow[]
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
            dareYaOutcomeType = picked.action_type
            dareYaLabel = picked.label
            // Freeze the one dollar amount relevant to this outcome type at
            // generation time — the reveal endpoint just reads dare_ya_action_value.
            dareYaActionValue = picked.action_type === 'fund_credit' ? Number(picked.credit_amount)
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
              index: 12, deed_text: 'I Dare Ya!',
              deed_text_long: 'Tap the centre square to take the I DARE YA challenge — you might win a little, lose a little, or get dared to refer a friend. The centre is a free space and always counts toward your Bingo.',
              deed_id: null, is_free_space: true, is_purchasable: false, purchase_price: null,
              is_referral_free: false, is_secret: false, secret_reward: null, is_bomb: false, quantity: 1, category: null,
              dare_ya_outcome_type: dareYaOutcomeType,
              dare_ya_label: dareYaLabel,
              dare_ya_action_value: dareYaActionValue,
              dare_ya_revealed: false,
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
              is_bomb: i === bombPosition,
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
          card_level: challengeLevel,
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

      // The "new game launched" batch email (game_launch_notifications +
      // sendGameLaunchEmails) is intentionally not fired here anymore — it
      // was premised on everyone's cards dropping together on a shared
      // weekly boundary. Now that card generation is per-player and async
      // (tap-out/bingo-driven, not calendar-driven), there's no shared
      // "launch moment" left to broadcast. Left in the codebase unused in
      // case a deliberate first-card welcome email is wanted later.

      return jsonResponse({
        card_id: newCard.id,
        week_year: newCard.week_year,
        created_at: newCard.created_at,
        game_mode: gameMode,
        card_level: challengeLevel,
        cells: sanitizeCells(cells, [], blackoutState?.hidden_cells),
        win_condition: adminWinCondition,
        completed_cells: [],
        purchased_cells: [],
        referral_cells: referralCellIndices,
        is_bingo: false,
        pick_three_used: false,
        blackout: blackoutState,
        ...getTapOutEligibility(newCard),
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

      // Bomb Square: doesn't complete like a normal deed — the whole card is
      // instantly rewritten instead. No confirmation beyond the normal
      // tap-then-confirm deed flow the player already went through to get
      // here; that's the surprise. Classic-mode only (blackout has no
      // special squares of any kind).
      if (cell.is_bomb === true) {
        const rebuilt = await regenerateClassicCard(supabase, user.sub, card.win_condition)
        // Guarded by the row's pre-read updated_at (see the main mark below
        // for why a two-step "claim, then separately write" was tried and
        // rejected): only the request that still matches the version it
        // read wins; a concurrent duplicate finds 0 rows and is rejected
        // before anything is written.
        const { data: written } = await supabase.from('player_cards').update({
          card_data: JSON.stringify(rebuilt.cells),
          completed_cells: '[]',
          purchased_cells: '[]',
          referral_cells: JSON.stringify(rebuilt.referralCellIndices),
          is_bingo: false,
          pick_three_used: false,
          play_cycle: (card.play_cycle ?? 0) + 1,
          bonus_patterns_awarded: '[]',
          updated_at: new Date().toISOString(),
        }).eq('id', card_id).eq('updated_at', card.updated_at).select('id').maybeSingle()
        if (!written) {
          return errorResponse('This card was updated elsewhere. Please refresh and try again.', 409)
        }

        return jsonResponse({
          success: true,
          bomb_triggered: true,
          cells: sanitizeCells(rebuilt.cells, []),
          completed_cells: [],
          purchased_cells: [],
          referral_cells: rebuilt.referralCellIndices,
          is_bingo: false,
          pick_three_used: false,
        })
      }

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

      // Secret square reward: figure out whether this mark earns one, but
      // don't touch the wallet yet — see the guarded write below for why.
      const secretRewardAmount =
        cell.is_secret && !cell.secret_revealed && (cell.secret_reward ?? 0) > 0 ? cell.secret_reward! : null
      if (secretRewardAmount != null) {
        cell.secret_revealed = true
        cells[cell_index] = cell
      }

      completed.push(cell_index)
      const allCompleted = [...new Set([...completed, ...purchased, ...referral, ...freeSpaceIndices(cells)])]
      const isBingo = checkBingo(allCompleted, card.win_condition)

      // Scoring table (One Line, Two Lines, Four Corners, X, Around the
      // Edges, Fill Card) — independent of win_condition, and the player
      // keeps playing this same card past their first win, so more can
      // complete later. See newlySatisfiedPatterns/awardBingoPatterns.
      const existingPatterns = parseJsonStrArr(card.bonus_patterns_awarded)
      const newPatterns = newlySatisfiedPatterns(completed, allCompleted, existingPatterns)

      // This write — not a separate earlier "claim" — is what has to be the
      // one guarded step. A claim-then-later-unconditional-write two-step
      // (tried first here) leaves a gap: a second request can slip its own
      // successful claim in between the first request's claim and its final
      // write, so both proceed. Gating the actual state-changing write
      // itself on the originally-read updated_at closes that: only one
      // request's version of "completed_cells" can ever be persisted for a
      // given prior card state, so nothing downstream (the wallet credit
      // below) runs unless this specific request's view of the card won.
      const { data: written } = await supabase.from('player_cards').update({
        card_data: JSON.stringify(cells),
        completed_cells: JSON.stringify(completed),
        is_bingo: isBingo,
        bonus_patterns_awarded: JSON.stringify([...existingPatterns, ...newPatterns.map((p) => p.pattern)]),
        updated_at: new Date().toISOString(),
      }).eq('id', card_id).eq('updated_at', card.updated_at).select('id').maybeSingle()
      if (!written) {
        return errorResponse('This card was updated elsewhere. Please refresh and try again.', 409)
      }

      let secretRewardAwarded: number | null = null
      if (secretRewardAmount != null) {
        const reward = secretRewardAmount
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
      }

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
          // Real-time calendar week, not the card's (possibly weeks-old)
          // creation week — draw-entry eligibility rides the actual clock,
          // independent of how long a card has been in play.
          completedDeedId, playerId: user.sub, weekYear: getCurrentWeekYear(),
          sourceType: 'bingo_card', settings: drawSettings,
        })
      }

      // Award any newly-completed scoring patterns' bonuses + congratulate
      // by email on first win.
      const bonusEntries = await awardBingoPatterns(supabase, {
        playerId: user.sub, cardId: card_id, weekYear: getCurrentWeekYear(),
        newPatterns, winCondition: card.win_condition,
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

    // ── POST /reset-card — "tap out" ──────────────────────────────────────────
    // Voluntarily ends the player's current card with no penalty (nothing
    // about it is reversed — completed deeds, wallet credits, streak, and
    // draw entries already earned all stand) and hands them a genuinely new
    // one. Only unlocks once the current card is TAP_OUT_MIN_DAYS old —
    // bingo completion does not shortcut this; winning behaves exactly as it
    // always has. Inserts a new player_cards row rather than reusing the old
    // one, so every card a player has played stays queryable as history.
    if (method === 'POST' && path === '/reset-card') {
      const user = requireAuth(authUser)
      const card = await getPlayerCurrentCard(supabase, user.sub)
      if (!card) return errorResponse('No card to reset', 404)

      const minAgeMs = TAP_OUT_MIN_DAYS * 24 * 60 * 60 * 1000
      const cardAgeMs = Date.now() - new Date(card.created_at).getTime()
      if (cardAgeMs < minAgeMs) {
        const eligibleAt = new Date(new Date(card.created_at).getTime() + minAgeMs)
        return errorResponse(
          `You can tap out once this card turns ${TAP_OUT_MIN_DAYS} days old (${eligibleAt.toDateString()}).`,
          400,
        )
      }

      const isBlackout = card.game_mode === 'blackout'
      let finalCells: Cell[]
      let referralCellIndices: number[] = []
      if (isBlackout) {
        finalCells = (await regenerateBlackoutCard(supabase, user.sub)).cells
      } else {
        const rebuilt = await regenerateClassicCard(supabase, user.sub, card.win_condition)
        finalCells = rebuilt.cells
        referralCellIndices = rebuilt.referralCellIndices
      }

      const { data: newCard, error: cardErr } = await supabase
        .from('player_cards')
        .insert({
          user_id: user.sub,
          week_year: getCurrentWeekYear(),
          card_data: JSON.stringify(finalCells),
          win_condition: card.win_condition,
          game_mode: card.game_mode ?? 'classic',
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
      if (isBlackout) {
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

      return jsonResponse({
        success: true,
        card_id: newCard.id,
        week_year: newCard.week_year,
        created_at: newCard.created_at,
        game_mode: newCard.game_mode,
        cells: sanitizeCells(finalCells, [], blackoutState?.hidden_cells),
        win_condition: newCard.win_condition,
        completed_cells: [], purchased_cells: [], referral_cells: referralCellIndices, is_bingo: false,
        blackout: blackoutState,
        ...getTapOutEligibility(newCard),
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

      const card = await getPlayerCurrentCard(supabase, user.sub)
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

      const card = await getPlayerCurrentCard(supabase, user.sub)
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
      const card = await getPlayerCurrentCard(supabase, user.sub)
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
      const card = await getPlayerCurrentCard(supabase, user.sub)
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

      const existingPatterns = parseJsonStrArr(card.bonus_patterns_awarded)
      const newPatterns = newlySatisfiedPatterns(completed, allCompleted, existingPatterns)

      await supabase.from('player_cards').update({
        purchased_cells: JSON.stringify(purchased),
        is_bingo: isBingo,
        bonus_patterns_awarded: JSON.stringify([...existingPatterns, ...newPatterns.map((p) => p.pattern)]),
        updated_at: new Date().toISOString(),
      }).eq('id', card_id)

      // Award any newly-completed scoring patterns' bonuses + congratulate by
      // email on first win. Note: a purchased square is not a completed deed,
      // so it earns NO deed entry, and it doesn't count as a "real" square
      // toward the bonus math either — only cells actually earned via a deed
      // (`completed`) do, per newlySatisfiedPatterns/realSquaresForPattern.
      const bonusEntries = await awardBingoPatterns(supabase, {
        playerId: user.sub, cardId: card_id, weekYear: getCurrentWeekYear(),
        newPatterns, winCondition: card.win_condition,
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

    // ── Wallet: GET /wallet, GET /wallet/transactions, POST /wallet/create-
    // payment-intent, POST /wallet/confirm-payment ───────────────────────────
    // Extracted to routes/wallet.ts.
    {
      const res = await handleWalletRoutes({ req, url, method, path, authUser, supabase })
      if (res) return res
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

    // ── Quick Tap: eligible deeds, a player's own picks, tapping, the
    // spotlight deed, and admin quick-deeds/categories management ─────────────
    // Extracted to routes/quick_tap.ts.
    {
      const res = await handleQuickTapRoutes({ req, url, method, path, authUser, supabase })
      if (res) return res
    }

    // ── Card Pickup Prompts: the reflection question, a player's answer, and
    // admin management of both ────────────────────────────────────────────────
    // Extracted to routes/card_pickup_prompts.ts.
    {
      const res = await handleCardPickupPromptsRoutes({ req, url, method, path, authUser, supabase })
      if (res) return res
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

    // ── Public/community stats: /impact/summary, /my-impact-stats,
    // /public/countries, /public/states/:id, /public/world-deeds,
    // /public/recent-deeds, /public/community-voices, /public/prize,
    // /public/latest-winner, /public/past-winners, /public/offline-status ──
    // Extracted to routes/public_stats.ts.
    {
      const res = await handlePublicStatsRoutes({ req, url, method, path, authUser, supabase })
      if (res) return res
    }

    // ── POST /admin/verify ────────────────────────────────────────────────────
    // Lockout is scoped per-visitor (bucket_key = IP), not global — a
    // stranger repeatedly guessing wrong only ever locks themselves out,
    // never the real admin on a different connection. See migration
    // 20260831000002_admin_lockout_per_ip.sql for why.
    if (method === 'POST' && path === '/admin/verify') {
      const body = await req.json()
      const bucketKey = getClientIp(req)

      const { data: lockout } = await supabase
        .from('admin_lockout_by_ip').select('*').eq('bucket_key', bucketKey).maybeSingle()

      if (lockout?.locked) {
        return errorResponse('Admin login locked for this connection. Check your email for an unlock link.', 423)
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

          await supabase.from('admin_lockout_by_ip').upsert({
            bucket_key: bucketKey,
            failed_attempts: newCount,
            locked: true,
            unlock_token: unlockToken,
            unlock_token_expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'bucket_key' })

          const { data: recipients } = await supabase
            .from('admin_alert_recipients').select('email').eq('is_active', true)

          if (recipients && recipients.length > 0) {
            const unlockUrl = `https://havagr8day.com/admin/unlock?token=${unlockToken}`
            const tpl = adminLockoutEmail(unlockUrl)
            await Promise.all(recipients.map((r) => sendEmail({ to: r.email, subject: tpl.subject, html: tpl.html })))
          }
        } else {
          await supabase.from('admin_lockout_by_ip').upsert({
            bucket_key: bucketKey,
            failed_attempts: newCount,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'bucket_key' })
        }

        // Same 403 whether this guess was merely wrong or the one that just
        // tripped the lock — an attacker shouldn't be able to distinguish the
        // two. 423 only fires on a *subsequent* attempt once already locked.
        return errorResponse('Invalid admin password', 403)
      }

      // Correct password — reset counter for this connection
      await supabase.from('admin_lockout_by_ip').upsert({
        bucket_key: bucketKey,
        failed_attempts: 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'bucket_key' })

      return jsonResponse({ success: true })
    }

    // ── GET /admin/unlock ──────────────────────────────────────────────────────
    if (method === 'GET' && path === '/admin/unlock') {
      const token = url.searchParams.get('token')
      if (!token) return errorResponse('Missing token', 400)

      const { data: lockout } = await supabase
        .from('admin_lockout_by_ip').select('*').eq('unlock_token', token).maybeSingle()

      if (!lockout?.locked) {
        return errorResponse('Link invalid or already used', 400)
      }
      if (new Date(lockout.unlock_token_expires_at) < new Date()) {
        return errorResponse('Link expired', 400)
      }

      await supabase.from('admin_lockout_by_ip').update({
        locked: false,
        failed_attempts: 0,
        unlock_token: null,
        unlock_token_expires_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', lockout.id)

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

    // ── Admin config/teams: settings editor, team CRUD/membership, and the
    // player-lookup (single card + full member list) endpoints ───────────────
    // Extracted to routes/admin_config.ts.
    {
      const res = await handleAdminConfigRoutes({ req, url, method, path, authUser, supabase })
      if (res) return res
    }

    // ── Deed catalog: admin CRUD/import, targeting, suggest-deed, and the
    // pending-deed review queue ───────────────────────────────────────────────
    // Extracted to routes/admin_deeds.ts.
    {
      const res = await handleAdminDeedsRoutes({ req, url, method, path, authUser, supabase })
      if (res) return res
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

      // Unmarking takes back everything this square earned — its draw
      // entry, and any scoring-pattern bonus that no longer holds without
      // it — not just the checkmark. See _shared/deed_reversal.ts.
      const result = await reverseCellCompletion(supabase, card, cell_index, user.sub, 'Player unmarked the square')
      if (!result.ok) {
        return errorResponse('This card was updated elsewhere. Please refresh and try again.', 409)
      }

      return jsonResponse({ success: true, completed_cells: result.updatedCompleted, is_bingo: result.isBingo })
    }

    // ── POST /admin/announce-game, GET /admin/test-encouragement-blurb ───────
    // Extracted to routes/admin_announce.ts.
    {
      const res = await handleAdminAnnounceRoutes({ req, url, method, path, authUser, supabase })
      if (res) return res
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

      // Voiding takes back everything this square earned — its draw entry,
      // and any scoring-pattern bonus that no longer holds without it — not
      // just the checkmark. See _shared/deed_reversal.ts.
      const result = await reverseCellCompletion(supabase, card, cell_index, authUser!.sub, voidReason ?? 'Voided by admin')
      if (!result.ok) {
        return errorResponse('This card was updated elsewhere. Please try again.', 409)
      }

      await supabase.from('cell_mark_log').insert({
        user_id: card.user_id,
        card_id,
        cell_index,
        action: 'void',
        voided_by: authUser!.sub,
        void_reason: voidReason,
      })

      return jsonResponse({
        success: true,
        completed_cells: result.updatedCompleted,
        is_bingo: result.isBingo,
        deed_entry_reversed: result.deedReversed,
        bingo_bonus_reversed: result.bingoReversed,
      })
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

    // ── Prize claims: player submission and admin queue management ───────────
    // Extracted to routes/prizes.ts.
    {
      const res = await handlePrizesRoutes({ req, url, method, path, authUser, supabase })
      if (res) return res
    }

    // ── GET /admin/deed-log, GET /admin/deed-log/export ──────────────────────
    // Extracted to routes/admin_deed_log.ts (see that file for the full
    // audit-log query/filter/CSV logic).
    {
      const res = await handleAdminDeedLogRoutes({ req, url, method, path, authUser, supabase })
      if (res) return res
    }

    // ── Admin draw/reporting: draw-results, weekly-updates, draw-leaderboard,
    // completed-deeds, founder-notes, reverse-deed, draw-adjust, run-draw ────
    // Extracted to routes/admin_draw_results.ts.
    {
      const res = await handleAdminDrawResultsRoutes({ req, url, method, path, authUser, supabase })
      if (res) return res
    }

    // ── Teams: a player's team+card view, the square-trade flow, and admin
    // trade oversight ─────────────────────────────────────────────────────────
    // Extracted to routes/teams_trades.ts.
    {
      const res = await handleTeamsTradesRoutes({ req, url, method, path, authUser, supabase })
      if (res) return res
    }

    // ── Streaks: a player's own streak, the streak/team leaderboards, admin
    // milestone management, and the one-time completed_deeds backfill ────────
    // Extracted to routes/streaks.ts.
    {
      const res = await handleStreaksRoutes({ req, url, method, path, authUser, supabase })
      if (res) return res
    }

    // ── I Dare Ya: reveal, refer-a-friend, and admin outcomes management ─────
    // Extracted to routes/dare_ya.ts.
    {
      const res = await handleDareYaRoutes({ req, url, method, path, authUser, supabase })
      if (res) return res
    }

    // ── Player profiles: own profile, public player view, admin badges
    // overview, and admin CRUD on player accounts ────────────────────────────
    // Extracted to routes/profiles.ts.
    {
      const res = await handleProfilesRoutes({ req, url, method, path, authUser, supabase })
      if (res) return res
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
