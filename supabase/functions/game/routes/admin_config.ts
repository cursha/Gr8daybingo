// =============================================================================
// Admin: the generic game_configs settings editor, team management, and two
// player-lookup endpoints (a single player's card, the full member list).
// Extracted wholesale out of game/index.ts; behavior is unchanged.
// =============================================================================
import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requireAdmin } from '../../_shared/auth.ts'
import { matchPath } from '../../_shared/db.ts'
import { parseJsonArr, sanitizeCells, getPlayerCurrentCard } from '../../_shared/card_helpers.ts'
import { RouteHandler } from '../route_types.ts'

export const handleAdminConfigRoutes: RouteHandler = async ({ req, path, method, authUser, supabase }) => {
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

    // The player's current card, whichever week it was created in — a
    // card is no longer guaranteed to match today's calendar week.
    const card = await getPlayerCurrentCard(supabase, targetUser.id)

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
        created_at: card.created_at,
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
      .select('id, email, username, name, first_name, last_name, role, province_state, country, city, country_id, state_id, player_number, last_login, profile_completed, email_verified, is_trusted, is_test, is_active, excluded_from_draw, last_valid_deed_date, created_at')
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
        is_active: u.is_active ?? true,
        excluded_from_draw: !!u.excluded_from_draw,
        last_valid_deed_date: u.last_valid_deed_date ?? null,
        created_at: u.created_at ?? null,
      })),
    })
  }

  return null
}
