// =============================================================================
// The "I Dare Ya" centre square: revealing its outcome, the refer-a-friend
// variant, and admin management of the six possible outcomes/odds. Extracted
// wholesale out of game/index.ts; behavior (including the optimistic-
// concurrency guards on the two player-facing writes) is unchanged.
// =============================================================================
import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requireAuth, requireAdmin } from '../../_shared/auth.ts'
import { Cell, dareYaField, parseJsonArr, parseJsonStrArr, freeSpaceIndices } from '../../_shared/card_helpers.ts'
import { checkBingo, newlySatisfiedPatterns } from '../../_shared/bingo_logic.ts'
import { getCurrentWeekYear } from '../../_shared/week.ts'
import { fetchTargetingData, filterDeedsByTargeting } from '../../_shared/targeting.ts'
import { awardBingoPatterns } from '../../_shared/bingo_award.ts'
import { RouteContext, RouteHandler } from '../route_types.ts'

// Server-side guard mirroring the admin UI's 100% gate: sums the *active*
// odds_percent across all rows, substituting in a pending add/edit before
// persisting, so a bad request can never leave the table off 100%.
async function assertActiveOddsSumTo100(
  supabase: RouteContext['supabase'],
  excludeId: number | null,
  pendingIsActive: boolean,
  pendingPercent: number,
): Promise<string | null> {
  const { data: rows } = await supabase.from('dare_ya_outcomes').select('id, odds_percent, is_active')
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
// wallet payouts or the odds draw — every numeric field on a dare_ya_outcomes
// row must be non-negative, and odds_percent must be a valid percentage.
function validateDareYaNumeric(
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

export const handleDareYaRoutes: RouteHandler = async (ctx) => {
  const { req, method, path, authUser, supabase } = ctx

  // ── POST /dare-ya-reveal ──────────────────────────────────────────────────
  // Player clicks the centre cell — execute the pre-snapshotted I Dare Ya
  // outcome. Fires once per card for every outcome except refer_friend
  // (dare_ya_revealed guards re-entry); refer_friend stays unrevealed and
  // re-invocable until /dare-ya-refer-friend actually matches an email.
  if (method === 'POST' && path === '/dare-ya-reveal') {
    const user = requireAuth(authUser)
    const body = await req.json()
    const { card_id } = body as { card_id: number }

    const { data: card } = await supabase
      .from('player_cards').select('*').eq('id', card_id).eq('user_id', user.sub).maybeSingle()
    if (!card) return errorResponse('Card not found', 404)

    const cells: Cell[] = JSON.parse(card.card_data)
    const centerCell = cells[12]

    if (!centerCell || !dareYaField(centerCell, 'outcome_type')) {
      return errorResponse('No I Dare Ya outcome on this card', 400)
    }
    if (dareYaField(centerCell, 'revealed')) {
      return errorResponse('I Dare Ya outcome already revealed', 400)
    }

    const outcomeType = dareYaField(centerCell, 'outcome_type') as string
    const actionValue = Number(dareYaField(centerCell, 'action_value') ?? 0)
    const result: Record<string, unknown> = {
      outcome: outcomeType,
      label: dareYaField(centerCell, 'label') ?? outcomeType,
      amount: actionValue,
    }

    let updatedCompleted = parseJsonArr(card.completed_cells) as number[]
    const purchased = parseJsonArr(card.purchased_cells) as number[]
    const referral = parseJsonArr(card.referral_cells) as number[]

    // fund_credit/remove_funds touch the wallet — deferred until after the
    // guarded card write below wins, so a losing concurrent request can
    // never reach the wallet. free_square/replace_three only affect
    // card_data/completed_cells, which the guarded write itself covers, so
    // they're computed here same as before.
    let pendingWalletEffect: 'fund_credit' | 'remove_funds' | null = null

    if (outcomeType === 'free_square') {
      if (!updatedCompleted.includes(12)) updatedCompleted.push(12)

    } else if (outcomeType === 'fund_credit') {
      pendingWalletEffect = 'fund_credit'

    } else if (outcomeType === 'remove_funds') {
      pendingWalletEffect = 'remove_funds'

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
    // /dare-ya-refer-friend) until a submitted email actually matches and
    // credits the reward. Setting dare_ya_revealed here unconditionally
    // would permanently disable the centre square client-side the moment
    // the player closes the modal, before they ever get to submit an
    // email — locking them out of a reward they haven't had a chance to
    // claim yet. Written under the new key only — dareYaField() always
    // checks it first, so this "wins" over a legacy bet_ya_revealed even
    // on a pre-rename card.
    cells[12] = outcomeType === 'refer_friend' ? centerCell : { ...centerCell, dare_ya_revealed: true }

    const allCompleted = [...new Set([...updatedCompleted, ...purchased, ...referral, ...freeSpaceIndices(cells)])]
    const isBingo = checkBingo(allCompleted, card.win_condition)

    const existingPatterns = parseJsonStrArr(card.bonus_patterns_awarded)
    const newPatterns = newlySatisfiedPatterns(updatedCompleted, allCompleted, existingPatterns)

    // This write is the guard, not a separate earlier "claim" — a
    // claim-then-later-unconditional-write two-step leaves a gap where a
    // second request's own claim can slip in before the first request's
    // final write lands, so both proceed (proved out under real
    // concurrency while fixing mark-cell; see that endpoint's comment).
    // Gating this actual state-changing write on the originally-read
    // updated_at means only one request's outcome can ever be persisted,
    // so the wallet effect below only runs for the request that won.
    const { data: written } = await supabase.from('player_cards').update({
      card_data: JSON.stringify(cells),
      completed_cells: JSON.stringify(updatedCompleted),
      is_bingo: isBingo,
      bonus_patterns_awarded: JSON.stringify([...existingPatterns, ...newPatterns.map((p) => p.pattern)]),
      updated_at: new Date().toISOString(),
    }).eq('id', card_id).eq('updated_at', card.updated_at).select('id').maybeSingle()
    if (!written) {
      return errorResponse('This I Dare Ya square was already processed. Please refresh and try again.', 409)
    }

    if (pendingWalletEffect === 'fund_credit') {
      let { data: wallet } = await supabase.from('player_wallets').select('*').eq('user_id', user.sub).maybeSingle()
      if (!wallet) {
        const { data: w } = await supabase.from('player_wallets').insert({ user_id: user.sub, balance: 0 }).select().single()
        wallet = w
      }
      const newBalance = parseFloat(wallet.balance) + actionValue
      await supabase.from('player_wallets').update({ balance: newBalance, updated_at: new Date().toISOString() }).eq('user_id', user.sub)
      await supabase.from('wallet_transactions').insert({
        user_id: user.sub, amount: actionValue, transaction_type: 'dare_reward',
        item_description: `I Dare Ya! reward (+${actionValue.toFixed(2)} Gr8Day Bucks)`,
      })
      result.new_balance = newBalance

    } else if (pendingWalletEffect === 'remove_funds') {
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
          user_id: user.sub, amount: -deduction, transaction_type: 'dare_penalty',
          item_description: `I Dare Ya! penalty (-${deduction.toFixed(2)} Gr8Day Bucks)`,
        })
      }
      result.new_balance = newBalance
      result.amount = deduction
    }

    // Award any newly-completed scoring patterns' bonuses + congratulate by
    // email on first win, same as mark-cell.
    const bonusEntries = await awardBingoPatterns(supabase, {
      playerId: user.sub, cardId: card_id, weekYear: getCurrentWeekYear(),
      newPatterns, winCondition: card.win_condition,
      wasAlreadyBingo: card.is_bingo, isBingoNow: isBingo,
      userEmail: user.email, userName: user.name as string | undefined,
    })

    result.is_bingo = isBingo
    result.completed_cells = updatedCompleted
    if (bonusEntries > 0) result.draw_bonus_entries = bonusEntries
    return jsonResponse(result)
  }

  // ── POST /dare-ya-refer-friend ────────────────────────────────────────────
  // Player submits an email at the "refer_friend" center square. Matches
  // against an already-validated referral (friend registered with this
  // email, referred by the current player) that hasn't been paid out via
  // this flow before. No match / already-credited: no state change, the
  // player can retry with a different email indefinitely.
  if (method === 'POST' && path === '/dare-ya-refer-friend') {
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
    if (!centerCell || dareYaField(centerCell, 'outcome_type') !== 'refer_friend') {
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
      .is('dare_ya_credited_at', null)
      .maybeSingle()

    if (!referralMatch) {
      // No validated, not-yet-credited referral for this email — no state change.
      return jsonResponse({ matched: false, message: 'No matching referral found for that email yet. You can try again anytime.' })
    }

    const rewardAmount = Number(dareYaField(centerCell, 'action_value') ?? 0)
    cells[12] = { ...centerCell, dare_ya_label: 'Friend Referred', dare_ya_revealed: true }
    const updatedCompleted = [...completed, 12]
    const purchased = parseJsonArr(card.purchased_cells) as number[]
    const referral = parseJsonArr(card.referral_cells) as number[]
    const allCompleted = [...new Set([...updatedCompleted, ...purchased, ...referral, ...freeSpaceIndices(cells)])]
    const isBingo = checkBingo(allCompleted, card.win_condition)

    const existingPatterns = parseJsonStrArr(card.bonus_patterns_awarded)
    const newPatterns = newlySatisfiedPatterns(updatedCompleted, allCompleted, existingPatterns)

    // This write is the guard, not a separate earlier "claim" — see the
    // comment on the equivalent write in /dare-ya-reveal for why a
    // claim-then-later-unconditional-write two-step doesn't actually
    // serialize concurrent requests. Gating this real write on the
    // originally-read updated_at means only one concurrent submission
    // (even against two different valid referral emails) can ever
    // complete the centre square, so the referral stamp and wallet
    // credit below only run for the request that won.
    const { data: written } = await supabase.from('player_cards').update({
      card_data: JSON.stringify(cells),
      completed_cells: JSON.stringify(updatedCompleted),
      is_bingo: isBingo,
      bonus_patterns_awarded: JSON.stringify([...existingPatterns, ...newPatterns.map((p) => p.pattern)]),
      updated_at: new Date().toISOString(),
    }).eq('id', card_id).eq('updated_at', card.updated_at).select('id').maybeSingle()
    if (!written) {
      return errorResponse('This centre square was already completed. Please refresh and try again.', 409)
    }

    // Stamp the referral row so a future retry/race can't double-pay it —
    // guarded the same way: only succeeds if still uncredited.
    const { data: referralClaimed } = await supabase
      .from('referrals')
      .update({ dare_ya_credited_at: new Date().toISOString() })
      .eq('id', referralMatch.id)
      .is('dare_ya_credited_at', null)
      .select('id')
      .maybeSingle()

    let newBalance: number | null = null
    if (referralClaimed) {
      let { data: wallet } = await supabase.from('player_wallets').select('*').eq('user_id', user.sub).maybeSingle()
      if (!wallet) {
        const { data: w } = await supabase.from('player_wallets').insert({ user_id: user.sub, balance: 0 }).select().single()
        wallet = w
      }
      newBalance = parseFloat(wallet.balance) + rewardAmount
      await supabase.from('player_wallets').update({ balance: newBalance, updated_at: new Date().toISOString() }).eq('user_id', user.sub)
      await supabase.from('wallet_transactions').insert({
        user_id: user.sub, amount: rewardAmount, transaction_type: 'dare_referral_reward',
        item_description: `I Dare Ya! Friend Referred reward (+${rewardAmount.toFixed(2)} Gr8Day Bucks)`,
      })
    }

    const result: Record<string, unknown> = {
      matched: true, label: 'Friend Referred', amount: rewardAmount, new_balance: newBalance,
      completed_cells: updatedCompleted, is_bingo: isBingo,
    }

    const bonusEntries = await awardBingoPatterns(supabase, {
      playerId: user.sub, cardId: card_id, weekYear: getCurrentWeekYear(),
      newPatterns, winCondition: card.win_condition,
      wasAlreadyBingo: card.is_bingo, isBingoNow: isBingo,
      userEmail: user.email, userName: user.name as string | undefined,
    })
    if (bonusEntries > 0) result.draw_bonus_entries = bonusEntries

    return jsonResponse(result)
  }

  // ── GET /admin/dare-ya-outcomes ───────────────────────────────────────────
  if (method === 'GET' && path === '/admin/dare-ya-outcomes') {
    requireAdmin(authUser)
    let { data } = await supabase.from('dare_ya_outcomes').select('*').order('id')
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
      const { data: seeded, error: seedErr } = await supabase.from('dare_ya_outcomes').insert(EQUAL_SPLIT_DEFAULTS).select()
      if (seedErr) return errorResponse(seedErr.message, 500)
      data = seeded
    }
    return jsonResponse({ outcomes: data ?? [] })
  }

  // ── POST /admin/dare-ya-outcomes ──────────────────────────────────────────
  if (method === 'POST' && path === '/admin/dare-ya-outcomes') {
    requireAdmin(authUser)
    const body = await req.json()
    const VALID_TYPES = ['free_square','refer_friend','fund_credit','remove_funds','replace_three','nothing']
    if (!VALID_TYPES.includes(body.action_type)) return errorResponse('Invalid action_type', 400)
    const oddsPercent = Number(body.odds_percent ?? 0)
    const creditAmount = Number(body.credit_amount ?? 0)
    const removeAmount = Number(body.remove_amount ?? 0)
    const rewardAmount = Number(body.reward_amount ?? 5)
    const numErr = validateDareYaNumeric(oddsPercent, creditAmount, removeAmount, rewardAmount)
    if (numErr) return errorResponse(numErr, 400)
    const isActive = body.is_active !== false
    const sumErr = await assertActiveOddsSumTo100(supabase, null, isActive, oddsPercent)
    if (sumErr) return errorResponse(sumErr, 400)
    const { data, error } = await supabase.from('dare_ya_outcomes').insert({
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

  // ── PUT /admin/dare-ya-outcomes/:id ───────────────────────────────────────
  const dareYaUpdateMatch = method === 'PUT' && path.match(/^\/admin\/dare-ya-outcomes\/(\d+)$/)
  if (dareYaUpdateMatch) {
    requireAdmin(authUser)
    const id = parseInt(dareYaUpdateMatch[1])
    const body = await req.json()
    const { data: existingRow } = await supabase.from('dare_ya_outcomes').select('*').eq('id', id).maybeSingle()
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
    const numErr = validateDareYaNumeric(pendingPercent, pendingCredit, pendingRemove, pendingReward)
    if (numErr) return errorResponse(numErr, 400)
    const pendingIsActive = (updates.is_active as boolean | undefined) ?? Boolean(existingRow.is_active)
    const sumErr = await assertActiveOddsSumTo100(supabase, id, pendingIsActive, pendingPercent)
    if (sumErr) return errorResponse(sumErr, 400)
    const { data, error } = await supabase.from('dare_ya_outcomes').update(updates).eq('id', id).select().single()
    if (error) return errorResponse(error.message, 400)
    return jsonResponse({ outcome: data })
  }

  // ── DELETE /admin/dare-ya-outcomes/:id ────────────────────────────────────
  const dareYaDeleteMatch = method === 'DELETE' && path.match(/^\/admin\/dare-ya-outcomes\/(\d+)$/)
  if (dareYaDeleteMatch) {
    requireAdmin(authUser)
    const id = parseInt(dareYaDeleteMatch[1])
    const { data: existingRow } = await supabase.from('dare_ya_outcomes').select('is_active').eq('id', id).maybeSingle()
    if (!existingRow) return errorResponse('Outcome not found', 404)
    // Only an active row's removal can break the 100% invariant — deleting
    // an already-inactive row never changes the active total.
    if (existingRow.is_active) {
      const sumErr = await assertActiveOddsSumTo100(supabase, id, false, 0)
      if (sumErr) return errorResponse(sumErr, 400)
    }
    await supabase.from('dare_ya_outcomes').delete().eq('id', id)
    return jsonResponse({ success: true })
  }

  return null
}
