// =============================================================================
// Public/community-facing read endpoints: the Impact Board, the world map,
// the recent-deeds ticker, community voices, and the prize/winner banners.
// None of these expose player identity beyond a username or a display name
// snapshotted at draw time — see each handler's own comment for specifics.
// Extracted wholesale out of game/index.ts; behavior is unchanged.
// =============================================================================
import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requireAuth } from '../../_shared/auth.ts'
import { matchPath } from '../../_shared/db.ts'
import { getCurrentWeekYear, getWeekStart } from '../../_shared/week.ts'
import { Cell, parseJsonArr, freeSpaceIndices } from '../../_shared/card_helpers.ts'
import { RouteContext, RouteHandler } from '../route_types.ts'

/** Shape a draw_winners row for public display — display name and prize come
 *  from the snapshot columns taken at draw time (see runWeeklyDraw), so this
 *  never needs a live join and stays correct even after the user is deleted
 *  or the admin changes this week's prize. Rows created before the snapshot
 *  columns existed fall back to a best-effort live lookup so old data still
 *  renders something. Never exposes email or user_id. */
async function formatPublicWinner(
  supabase: RouteContext['supabase'],
  row: {
    user_id: string | null
    week_year: string
    selected_at: string
    winner_display_name: string | null
    prize_title_snapshot: string | null
    prize_image_url_snapshot: string | null
  },
): Promise<{ display_name: string; prize_title: string | null; prize_image_url: string | null; week_year: string; selected_at: string }> {
  let displayName = row.winner_display_name
  if (!displayName && row.user_id) {
    const { data: u } = await supabase
      .from('users').select('first_name, last_name, username, player_number').eq('id', row.user_id).maybeSingle()
    displayName = u
      ? [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || (u.player_number ? `GR8-${u.player_number}` : null)
      : null
  }
  return {
    display_name: displayName ?? 'A Havagr8day player',
    prize_title: row.prize_title_snapshot ?? null,
    prize_image_url: row.prize_image_url_snapshot ?? null,
    week_year: row.week_year,
    selected_at: row.selected_at,
  }
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

export const handlePublicStatsRoutes: RouteHandler = async (ctx) => {
  const { req, url, method, path, authUser, supabase } = ctx

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

  // ── GET /public/latest-winner ─────────────────────────────────────────────
  // Most recent weekly draw winner, for the homepage banner. No auth — same
  // public-leaderboard precedent as /public/prize and /leaderboard/players.
  if (method === 'GET' && path === '/public/latest-winner') {
    const { data: row } = await supabase
      .from('draw_winners')
      .select('user_id, week_year, selected_at, winner_display_name, prize_title_snapshot, prize_image_url_snapshot')
      .order('selected_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return jsonResponse({ winner: row ? await formatPublicWinner(supabase, row) : null })
  }

  // ── GET /public/past-winners ──────────────────────────────────────────────
  if (method === 'GET' && path === '/public/past-winners') {
    const limitParam = parseInt(url.searchParams.get('limit') ?? '12')
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 52) : 12
    const { data: rows } = await supabase
      .from('draw_winners')
      .select('user_id, week_year, selected_at, winner_display_name, prize_title_snapshot, prize_image_url_snapshot')
      .order('selected_at', { ascending: false })
      .limit(limit)
    const winners = await Promise.all((rows ?? []).map((r) => formatPublicWinner(supabase, r)))
    return jsonResponse({ winners })
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

  return null
}
