import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthUser, requireAuth } from '../_shared/auth.ts'
import { getSupabase, getSubPath, matchPath } from '../_shared/db.ts'
import { sendEmail, passwordResetEmail, referralInviteEmail, bingoWinEmail, prizeClaimConfirmationEmail } from '../_shared/email.ts'
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

const WIN_LABELS: Record<string, string> = {
  one_line: 'One Line', two_lines: 'Two Lines', four_corners: 'Four Corners',
  x_pattern: 'X Pattern', around_the_edges: 'Around the Edges', fill_card: 'Fill the Card',
}
function winLabel(cond: string): string { return WIN_LABELS[cond] ?? cond }

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
            .from('good_deeds').select('id, quantity').in('id', deedIds)
          const qtyById = new Map<number, number>()
          for (const d of freshDeeds ?? []) qtyById.set(d.id, d.quantity ?? 1)
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
          const allCompleted = [...new Set([...completed, ...purchased, ...referral])]
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

        return jsonResponse({
          card_id: existing.id,
          week_year: existing.week_year,
          cells,
          win_condition: existing.win_condition,
          completed_cells: parseJsonArr(existing.completed_cells),
          purchased_cells: parseJsonArr(existing.purchased_cells),
          referral_cells: parseJsonArr(existing.referral_cells),
          is_bingo: existing.is_bingo ?? false,
        })
      }

      // Build a new card
      const { data: deeds } = await supabase
        .from('good_deeds').select('*').eq('is_active', true)
      if (!deeds || deeds.length < 24) {
        return errorResponse('Not enough active deeds to generate a card', 400)
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
            index: 12, deed_text: 'Refer a Player',
            deed_text_long: 'Invite a friend to play! Submit a valid referral and this square marks itself complete.',
            deed_id: null, is_free_space: false, is_purchasable: false, purchase_price: null,
            is_referral_free: true, is_secret: false, secret_reward: null, quantity: 1,
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
        cells,
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
      const allCompleted = [...new Set([...completed, ...purchased, ...referral])]
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

      // First time the card reaches Bingo: congratulate by email (best-effort).
      if (isBingo && !card.is_bingo && user.email) {
        const tpl = bingoWinEmail((user.name as string | undefined) ?? null, winLabel(card.win_condition))
        await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html })
      }

      const resp: Record<string, unknown> = { success: true, completed_cells: completed, is_bingo: isBingo }
      if (secretRewardAwarded !== null) resp.secret_reward = secretRewardAwarded
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
        cells: JSON.parse(card.card_data),
        win_condition: card.win_condition,
        completed_cells: [], purchased_cells: [], referral_cells: [], is_bingo: false,
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
      const allCompleted = [...new Set([...completed, ...purchased, ...referral])]
      const isBingo = checkBingo(allCompleted, card.win_condition)

      await supabase.from('player_cards').update({
        purchased_cells: JSON.stringify(purchased),
        is_bingo: isBingo,
        updated_at: new Date().toISOString(),
      }).eq('id', card_id)

      // First time the card reaches Bingo: congratulate by email (best-effort).
      if (isBingo && !card.is_bingo && user.email) {
        const tpl = bingoWinEmail((user.name as string | undefined) ?? null, winLabel(card.win_condition))
        await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html })
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
        return errorResponse('Invalid admin password', 401)
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

    // ── GET /admin/members ────────────────────────────────────────────────────
    if (method === 'GET' && path === '/admin/members') {
      const { data } = await supabase
        .from('users')
        .select('id, email, username, name, first_name, last_name, role, challenge_level, province_state, country, last_login, profile_completed')
        .order('last_login', { ascending: false })
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
      const allCompleted = [...new Set([...updatedCompleted, ...purchased, ...referral])]
      const isBingo = checkBingo(allCompleted, card.win_condition)

      await supabase.from('player_cards').update({
        completed_cells: JSON.stringify(updatedCompleted),
        is_bingo: isBingo,
        updated_at: new Date().toISOString(),
      }).eq('id', card_id)

      return jsonResponse({ success: true, completed_cells: updatedCompleted, is_bingo: isBingo })
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
      const allCompleted = [...new Set([...updatedCompleted, ...purchased, ...referral])]
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
        .select('*, users(username, email)')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return jsonResponse({ logs: data ?? [] })
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
