// =============================================================================
// Teams: a player's own team + teammates' cards, the square-trade offer flow
// (create/accept/reject, weekly limits), and admin trade oversight (list +
// void, including reversing an already-accepted swap). Extracted wholesale
// out of game/index.ts; behavior is unchanged.
// =============================================================================
import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requireAuth, requireAdmin } from '../../_shared/auth.ts'
import { getCurrentWeekYear } from '../../_shared/week.ts'
import { Cell, parseJsonArr, sanitizeCells, getPlayerCurrentCard } from '../../_shared/card_helpers.ts'
import { RouteHandler } from '../route_types.ts'

export const handleTeamsTradesRoutes: RouteHandler = async ({ req, url, path, method, authUser, supabase }) => {
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

    // Fetch each member's current card — no longer necessarily created
    // this calendar week, so pick the most recent row per member rather
    // than filtering by week_year.
    const memberUserIds = (team.team_members ?? []).map((m: any) => m.user_id)
    const { data: memberCardRows } = await supabase
      .from('player_cards')
      .select('id, user_id, week_year, card_data, win_condition, completed_cells, purchased_cells, referral_cells, is_bingo, game_mode')
      .in('user_id', memberUserIds)
      .order('created_at', { ascending: false })
    const seenMemberIds = new Set<string>()
    const cards = (memberCardRows ?? []).filter((c) => {
      if (seenMemberIds.has(c.user_id)) return false
      seenMemberIds.add(c.user_id)
      return true
    })

    // Blocked (passed-on) Blackout squares stay off-limits for trading same
    // as completed/purchased/referral squares — fetch in one batch.
    const blackoutCardIds = (cards ?? []).filter((c) => c.game_mode === 'blackout').map((c) => c.id)
    const blockedByCard: Record<number, number[]> = {}
    if (blackoutCardIds.length > 0) {
      const { data: states } = await supabase
        .from('blackout_state').select('card_id, blocked_cells').in('card_id', blackoutCardIds)
      for (const s of (states ?? [])) blockedByCard[s.card_id] = s.blocked_cells ?? []
    }

    const cardsByUser: Record<string, any> = {}
    for (const c of (cards ?? [])) {
      const completed = parseJsonArr(c.completed_cells)
      const referral = parseJsonArr(c.referral_cells)
      const gameMode = c.game_mode ?? 'classic'
      cardsByUser[c.user_id] = {
        card_id: c.id,
        week_year: c.week_year,
        // Note: hidden Blackout squares are NOT redacted here — teammates
        // (and the trade picker) can already see their real deed content.
        // Position stays secret to the owner via hidden_cells; identity doesn't.
        cells: sanitizeCells(JSON.parse(c.card_data), completed),
        win_condition: c.win_condition,
        completed_cells: completed,
        purchased_cells: parseJsonArr(c.purchased_cells),
        referral_cells: referral,
        is_bingo: c.is_bingo,
        game_mode: gameMode,
        blackout: gameMode === 'blackout'
          ? { hidden_cells: [], blocked_cells: blockedByCard[c.id] ?? [], active_group: null, is_paused: false }
          : null,
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

    // Load each player's current card (not necessarily created this
    // calendar week — the weekly limits above are a separate throttle).
    const fromCard = await getPlayerCurrentCard(supabase, user.sub)
    if (!fromCard) return errorResponse('You do not have a card', 400)

    const toCard = await getPlayerCurrentCard(supabase, to_user_id)
    if (!toCard) return errorResponse('That player does not have a card', 400)

    // Blackout: trading is allowed, including still-hidden squares (that's
    // the point — otherwise only the couple of currently-open squares would
    // ever be tradeable). Only a blocked (passed-on) square is off-limits,
    // same treatment as a completed square. Position stays fogged for the
    // owner regardless — trading only swaps card_data, never hidden_cells.
    if (fromCard.game_mode === 'blackout') {
      const { data: fromState } = await supabase
        .from('blackout_state').select('blocked_cells').eq('card_id', fromCard.id).maybeSingle()
      if ((fromState?.blocked_cells ?? []).includes(from_cell_index)) {
        return errorResponse('Cannot trade a blocked square', 400)
      }
    }
    if (toCard.game_mode === 'blackout') {
      const { data: toState } = await supabase
        .from('blackout_state').select('blocked_cells').eq('card_id', toCard.id).maybeSingle()
      if ((toState?.blocked_cells ?? []).includes(to_cell_index)) {
        return errorResponse('Cannot trade a blocked square', 400)
      }
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
    if (fromCard.game_mode === 'blackout') {
      const { data: fromState } = await supabase
        .from('blackout_state').select('blocked_cells').eq('card_id', fromCard.id).maybeSingle()
      if ((fromState?.blocked_cells ?? []).includes(trade.from_cell_index)) {
        return errorResponse('The offerer\'s square has since been passed on', 400)
      }
    }
    if (toCard.game_mode === 'blackout') {
      const { data: toState } = await supabase
        .from('blackout_state').select('blocked_cells').eq('card_id', toCard.id).maybeSingle()
      if ((toState?.blocked_cells ?? []).includes(trade.to_cell_index)) {
        return errorResponse('Your square has since been passed on', 400)
      }
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

  // ── GET /admin/trades ───────────────────────────────────────────────────
  if (method === 'GET' && path === '/admin/trades') {
    requireAdmin(authUser)
    const limitParam = parseInt(url.searchParams.get('limit') ?? '50')
    const limit = Math.min(Math.max(1, limitParam), 200)
    const statusFilter = url.searchParams.get('status')
    const weekYearFilter = url.searchParams.get('week_year')

    let query = supabase
      .from('square_trades')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (statusFilter) query = query.eq('status', statusFilter)
    if (weekYearFilter) query = query.eq('week_year', weekYearFilter)
    const { data: trades, error: tradesErr } = await query
    if (tradesErr) throw tradesErr

    const userIds = new Set<string>()
    for (const t of trades ?? []) {
      userIds.add(t.from_user_id)
      userIds.add(t.to_user_id)
      if (t.voided_by) userIds.add(t.voided_by)
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
      voided_by_user: t.voided_by ? (usersById[t.voided_by] ?? null) : null,
    }))

    return jsonResponse({ trades: enriched })
  }

  // ── POST /admin/trades/:id/void ─────────────────────────────────────────
  // Same audit spirit as admin/void-cell: an admin can reverse a trade that
  // shouldn't have happened, with who/why recorded. A still-pending offer
  // just needs its status flipped. An already-accepted trade is reversed by
  // re-running the exact same pairwise field swap the accept handler did —
  // it's its own inverse, since the swap only ever exchanges deed_text/
  // deed_id/deed_text_long/quantity between the two indices and leaves
  // everything else (including which card/index) untouched.
  const tradeVoidMatch = path.match(/^\/admin\/trades\/(\d+)\/void$/)
  if (method === 'POST' && tradeVoidMatch) {
    requireAdmin(authUser)
    const tradeId = parseInt(tradeVoidMatch[1])
    const body = await req.json().catch(() => ({}))
    const voidReason = body.reason ? String(body.reason).trim().slice(0, 500) : null

    const { data: trade } = await supabase
      .from('square_trades').select('*').eq('id', tradeId).maybeSingle()
    if (!trade) return errorResponse('Trade not found', 404)
    if (!['pending', 'accepted'].includes(trade.status)) {
      return errorResponse(`Cannot void a trade that is already ${trade.status}`, 400)
    }

    if (trade.status === 'accepted') {
      const { data: fromCard } = await supabase
        .from('player_cards').select('*').eq('id', trade.from_card_id).maybeSingle()
      const { data: toCard } = await supabase
        .from('player_cards').select('*').eq('id', trade.to_card_id).maybeSingle()
      if (!fromCard || !toCard) return errorResponse('One or both cards no longer exist', 404)

      const fromCompleted = parseJsonArr(fromCard.completed_cells)
      const toCompleted = parseJsonArr(toCard.completed_cells)
      if (fromCompleted.includes(trade.from_cell_index) || toCompleted.includes(trade.to_cell_index)) {
        return errorResponse('One of the traded squares has since been completed — void the completion first (admin/void-cell), then void this trade', 400)
      }

      const fromCells: Cell[] = JSON.parse(fromCard.card_data)
      const toCells: Cell[] = JSON.parse(toCard.card_data)
      const fromCell = fromCells[trade.from_cell_index]
      const toCell = toCells[trade.to_cell_index]

      // Sanity check: these cells should still hold exactly what this trade
      // put there. If not, something else touched them since — bail rather
      // than guess at a reversal.
      if (fromCell?.deed_text !== trade.to_deed_text || toCell?.deed_text !== trade.from_deed_text) {
        return errorResponse('Card data has changed since this trade — cannot safely auto-reverse', 409)
      }

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

      await supabase.from('player_cards')
        .update({ card_data: JSON.stringify(fromCells), updated_at: new Date().toISOString() })
        .eq('id', fromCard.id)
      await supabase.from('player_cards')
        .update({ card_data: JSON.stringify(toCells), updated_at: new Date().toISOString() })
        .eq('id', toCard.id)
    }

    await supabase.from('square_trades').update({
      status: 'voided',
      voided_by: authUser!.sub,
      void_reason: voidReason,
      voided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', tradeId)

    return jsonResponse({ success: true })
  }

  return null
}
