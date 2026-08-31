// =============================================================================
// The daily streak tracker (a player's own streak, the streak leaderboard,
// admin milestone management, and the one-time completed_deeds backfill),
// plus the team leaderboard — small and adjacent enough to live alongside.
// Extracted wholesale out of game/index.ts; behavior is unchanged.
// =============================================================================
import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requireAuth, requireAdmin } from '../../_shared/auth.ts'
import { RouteHandler } from '../route_types.ts'

export const handleStreaksRoutes: RouteHandler = async ({ req, path, method, authUser, supabase }) => {
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

  return null
}
