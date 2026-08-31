// =============================================================================
// Admin Deed Log — GET /admin/deed-log and GET /admin/deed-log/export.
// Extracted wholesale out of game/index.ts: this cluster was already fully
// self-contained (its filter/query/shape/CSV helpers are used nowhere else
// in the app), so moving it here changes nothing about how it behaves.
// =============================================================================
import { jsonResponse, corsHeaders } from '../../_shared/cors.ts'
import { requireAdmin } from '../../_shared/auth.ts'
import { getCurrentWeekYear, getWeekStart } from '../../_shared/week.ts'
import { RouteContext, RouteHandler } from '../route_types.ts'

interface DeedLogFilters {
  startIso: string
  endIso: string
  playerQuery: string | null
  category: string | null
  teamId: number | null
}

interface DeedLogRow {
  id: number
  completed_at: string
  player_name: string
  deed_text: string
  category: string | null
  team_name: string | null
  square_type: 'Regular' | 'Quick Tap' | 'Blackout'
  reversed: boolean
}

function parseDeedLogFilters(url: URL): DeedLogFilters {
  const todayStr = new Date().toISOString().slice(0, 10)
  const weekStartStr = getWeekStart(getCurrentWeekYear()).toISOString().slice(0, 10)
  const start = url.searchParams.get('start') || weekStartStr
  const end = url.searchParams.get('end') || todayStr
  const teamIdParam = url.searchParams.get('team_id')
  return {
    startIso: `${start}T00:00:00.000Z`,
    endIso: `${end}T23:59:59.999Z`,
    playerQuery: url.searchParams.get('player')?.trim() || null,
    category: url.searchParams.get('category')?.trim() || null,
    teamId: teamIdParam ? parseInt(teamIdParam) : null,
  }
}

/** Builds the base completed_deeds query for these filters — everything
 *  except pagination, which callers apply (or don't, for the export). A
 *  free-text player filter resolves to a set of player_ids first, since
 *  PostgREST can't filter rows by a joined table's ilike match directly.
 *  Returns `{ query }` rather than the bare builder — the builder is itself
 *  thenable, so an async function returning it directly gets silently
 *  auto-awaited/flattened by JS instead of handing back the builder. */
async function buildDeedLogQuery(supabase: RouteContext['supabase'], filters: DeedLogFilters) {
  let query = supabase
    .from('completed_deeds')
    .select(
      'id, completed_at, category, source_type, deed_id, quick_deed_id, card_id, player_id, team_id_at_completion, is_hidden_from_impact_board, users:player_id(first_name, last_name, username), teams:team_id_at_completion(team_name)',
      { count: 'exact' },
    )
    .gte('completed_at', filters.startIso)
    .lte('completed_at', filters.endIso)
    .order('completed_at', { ascending: false })

  if (filters.category) query = query.eq('category', filters.category)
  if (filters.teamId != null) query = query.eq('team_id_at_completion', filters.teamId)

  if (filters.playerQuery) {
    const q = filters.playerQuery.replace(/[%,]/g, '')
    const { data: matches } = await supabase
      .from('users')
      .select('id')
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,username.ilike.%${q}%`)
    const ids = (matches ?? []).map((m) => m.id)
    // No matches → force an empty result rather than dropping the filter.
    query = query.in('player_id', ids.length > 0 ? ids : ['__no_match__'])
  }

  return { query }
}

/** Resolves deed text, the blackout/regular split (player_cards.game_mode),
 *  and display fields for a page of raw completed_deeds rows. Batched, not
 *  per-row — cost is independent of how many rows share the same deed.
 *
 *  Deed text resolves by which ID column is populated (deed_id ->
 *  good_deeds, quick_deed_id -> quick_deeds), NOT by source_type: a
 *  'quick_action' row can carry either — POST /quick-taps/:deedId/tap lets
 *  a player quick-tap one of their personally-chosen good_deeds-eligible
 *  deeds (deed_id set, quick_deed_id null), while POST /quick-deeds/:id/tap
 *  is the separate admin-configured quick_deeds button set (quick_deed_id
 *  set). Square type ('Quick Tap' vs 'Regular'/'Blackout') still keys off
 *  source_type — both quick-tap flows are genuinely "Quick Tap" from the
 *  player's perspective regardless of which table backs the deed. */
async function shapeDeedLogRows(supabase: RouteContext['supabase'], raw: any[]): Promise<DeedLogRow[]> {
  if (raw.length === 0) return []

  const goodDeedIds = [...new Set(raw.filter((r) => r.deed_id != null).map((r) => r.deed_id))]
  const quickDeedIds = [...new Set(raw.filter((r) => r.quick_deed_id != null).map((r) => r.quick_deed_id))]
  const cardIds = [...new Set(raw.filter((r) => r.card_id != null).map((r) => r.card_id))]

  const [goodDeedsRes, quickDeedsRes, cardsRes] = await Promise.all([
    goodDeedIds.length > 0 ? supabase.from('good_deeds').select('id, deed_text').in('id', goodDeedIds) : Promise.resolve({ data: [] as { id: number; deed_text: string }[] }),
    quickDeedIds.length > 0 ? supabase.from('quick_deeds').select('id, label').in('id', quickDeedIds) : Promise.resolve({ data: [] as { id: number; label: string }[] }),
    cardIds.length > 0 ? supabase.from('player_cards').select('id, game_mode').in('id', cardIds) : Promise.resolve({ data: [] as { id: number; game_mode: string }[] }),
  ])
  const deedTextById = new Map((goodDeedsRes.data ?? []).map((d) => [d.id, d.deed_text]))
  const quickLabelById = new Map((quickDeedsRes.data ?? []).map((d) => [d.id, d.label]))
  const gameModeByCard = new Map((cardsRes.data ?? []).map((c) => [c.id, c.game_mode]))

  return raw.map((r) => {
    const deedText = r.deed_id != null
      ? deedTextById.get(r.deed_id) ?? '(deleted deed)'
      : r.quick_deed_id != null
      ? quickLabelById.get(r.quick_deed_id) ?? '(deleted quick deed)'
      : '(unknown deed)'
    const squareType: DeedLogRow['square_type'] = r.source_type === 'quick_action'
      ? 'Quick Tap'
      : (gameModeByCard.get(r.card_id) === 'blackout' ? 'Blackout' : 'Regular')
    const u = r.users
    const playerName = u ? ([u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Unknown') : 'Unknown'
    return {
      id: r.id,
      completed_at: r.completed_at,
      player_name: playerName,
      deed_text: deedText,
      category: r.category,
      team_name: r.teams?.team_name ?? null,
      square_type: squareType,
      reversed: !!r.is_hidden_from_impact_board,
    }
  })
}

/** Loops the filtered query in batches of 1000 (PostgREST's per-request cap)
 *  until exhausted — the export has no pagination cap, so a single .range()
 *  call would silently truncate a large result set. */
async function fetchAllDeedLogRows(supabase: RouteContext['supabase'], filters: DeedLogFilters): Promise<DeedLogRow[]> {
  const BATCH = 1000
  const all: any[] = []
  for (let offset = 0; ; offset += BATCH) {
    const { query } = await buildDeedLogQuery(supabase, filters)
    const { data, error } = await query.range(offset, offset + BATCH - 1)
    if (error) throw error
    all.push(...(data ?? []))
    if (!data || data.length < BATCH) break
  }
  return shapeDeedLogRows(supabase, all)
}

function csvField(value: string | number | boolean | null | undefined): string {
  const s = String(value ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function deedLogRowsToCsv(rows: DeedLogRow[]): string {
  const header = ['Player', 'Deed', 'Category', 'Completed At', 'Team', 'Square Type', 'Reversed']
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push([
      csvField(r.player_name),
      csvField(r.deed_text),
      csvField(r.category),
      csvField(r.completed_at),
      csvField(r.team_name),
      csvField(r.square_type),
      csvField(r.reversed ? 'Yes' : 'No'),
    ].join(','))
  }
  return lines.join('\r\n')
}

export const handleAdminDeedLogRoutes: RouteHandler = async ({ method, path, url, authUser, supabase }) => {
  if (method === 'GET' && path === '/admin/deed-log') {
    requireAdmin(authUser)
    const filters = parseDeedLogFilters(url)
    const pageParam = parseInt(url.searchParams.get('page') ?? '0')
    const page = Number.isFinite(pageParam) && pageParam >= 0 ? pageParam : 0
    const pageSize = 50

    const { query } = await buildDeedLogQuery(supabase, filters)
    const { data, count, error } = await query.range(page * pageSize, page * pageSize + pageSize - 1)
    if (error) throw error

    const rows = await shapeDeedLogRows(supabase, data ?? [])
    return jsonResponse({ rows, total: count ?? rows.length, page, page_size: pageSize })
  }

  // ── GET /admin/deed-log/export ───────────────────────────────────────────
  // Same filters as /admin/deed-log, no pagination cap — streams the full
  // matching result set as a CSV download.
  if (method === 'GET' && path === '/admin/deed-log/export') {
    requireAdmin(authUser)
    const filters = parseDeedLogFilters(url)
    const rows = await fetchAllDeedLogRows(supabase, filters)
    const csv = deedLogRowsToCsv(rows)
    return new Response(csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="deed-log-${filters.startIso.slice(0, 10)}-to-${filters.endIso.slice(0, 10)}.csv"`,
      },
    })
  }

  return null
}
