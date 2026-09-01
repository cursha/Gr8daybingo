// =============================================================================
// Admin draw/reporting: past winners, weekly-update email history, the
// per-player draw-entry leaderboard, a player's completed-deed history,
// founder-note history, reversing a completed deed (and its bingo/bonus
// effects), manual draw-entry adjustment, and manually running the weekly
// draw. Extracted wholesale out of game/index.ts; behavior is unchanged.
// =============================================================================
import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requireAuth, requireAdmin } from '../../_shared/auth.ts'
import { getCurrentWeekYear, getWeekStart } from '../../_shared/week.ts'
import { Cell, parseJsonArr, parseJsonStrArr, freeSpaceIndices } from '../../_shared/card_helpers.ts'
import { checkBingo, completedLineIndices, isPatternComplete } from '../../_shared/bingo_logic.ts'
import { getDrawSettings, reverseDeedEntry, reversePatternBonus, manualAdjust, runWeeklyDraw } from '../../_shared/draw.ts'
import { sendEmail, drawWinnerAdminNotificationEmail } from '../../_shared/email.ts'
import { RouteHandler } from '../route_types.ts'

const ADMIN_EMAIL = 'curt.skene@curtskene.com'

export const handleAdminDrawResultsRoutes: RouteHandler = async ({ req, url, method, path, authUser, supabase }) => {
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

  // ── GET /admin/weekly-updates ─────────────────────────────────────────────
  // History of weekly member update emails actually sent, most recent first —
  // written by weekly-member-update's send loop, one row per delivered email.
  if (method === 'GET' && path === '/admin/weekly-updates') {
    requireAdmin(authUser)
    const { data: logs } = await supabase
      .from('weekly_update_log')
      .select('id, player_id, sent_at, week_of, message_snapshot, users!inner(first_name, name, username, email)')
      .order('sent_at', { ascending: false })
      .limit(50)
    return jsonResponse({
      logs: (logs ?? []).map((l: any) => ({
        id: l.id,
        player_id: l.player_id,
        sent_at: l.sent_at,
        week_of: l.week_of,
        message_snapshot: l.message_snapshot,
        name: l.users?.first_name ?? l.users?.name ?? l.users?.username ?? null,
        email: l.users?.email ?? null,
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

  // ── GET /admin/founder-notes ──────────────────────────────────────────────
  // Simple log view of founder_note_queue (see maybeQueueFounderNote in
  // _shared/deed_completion.ts and the hourly send-founder-notes function) —
  // status, scheduled/sent times, and the generated text, newest-scheduled
  // first. Paginated 50/page, same shape as the Deed Log tab.
  if (method === 'GET' && path === '/admin/founder-notes') {
    requireAdmin(authUser)
    const pageParam = parseInt(url.searchParams.get('page') ?? '0')
    const page = Number.isFinite(pageParam) && pageParam >= 0 ? pageParam : 0
    const pageSize = 50

    const { data, count, error } = await supabase
      .from('founder_note_queue')
      .select('id, deed_text_snapshot, generated_message, scheduled_send_at, sent_at, status, users:user_id(first_name, last_name, username)', { count: 'exact' })
      .order('scheduled_send_at', { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1)
    if (error) throw error

    const rows = (data ?? []).map((r: any) => {
      const u = r.users
      return {
        id: r.id,
        player_name: u ? ([u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Unknown') : 'Unknown',
        deed_text_snapshot: r.deed_text_snapshot,
        generated_message: r.generated_message,
        scheduled_send_at: r.scheduled_send_at,
        sent_at: r.sent_at,
        status: r.status,
      }
    })
    return jsonResponse({ rows, total: count ?? rows.length, page, page_size: pageSize })
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

    // If this deed sat on a bingo card, recompute which scoring patterns
    // are still satisfied once this cell is removed. Any pattern that was
    // previously paid but no longer holds gets its bonus reversed
    // individually — a card can have multiple independently-paid
    // patterns now, not just one card-level bonus.
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

        const completedSet = new Set(allCompleted)
        const lineCount = completedLineIndices(allCompleted).length
        const previouslyAwardedPatterns = parseJsonStrArr(card.bonus_patterns_awarded)
        const patternsToReverse = previouslyAwardedPatterns.filter((p) => !isPatternComplete(p, lineCount, completedSet))
        const remainingAwardedPatterns = previouslyAwardedPatterns.filter((p) => isPatternComplete(p, lineCount, completedSet))

        // Reflect the removal on the card itself.
        await supabase.from('player_cards').update({
          completed_cells: JSON.stringify(completed),
          is_bingo: stillBingo,
          bonus_patterns_awarded: JSON.stringify(remainingAwardedPatterns),
          updated_at: new Date().toISOString(),
        }).eq('id', card.id)

        for (const pattern of patternsToReverse) {
          const reversed = await reversePatternBonus(supabase, card.id, pattern, admin.sub, reason)
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

    if (result.winner_id && !result.already_ran) {
      try {
        const adminTpl = drawWinnerAdminNotificationEmail({
          winnerName: result.winner_name,
          winnerEmail: result.winner_email,
          weekYear: result.week_year,
          winningEntries: result.winning_entries,
          poolEntries: result.pool_entries,
          eligiblePlayers: result.eligible_players,
        })
        await sendEmail({ to: ADMIN_EMAIL, subject: adminTpl.subject, html: adminTpl.html })
      } catch { /* best-effort — never fail the request over a notification email */ }
    }

    return jsonResponse({ success: true, draw: result })
  }

  return null
}
