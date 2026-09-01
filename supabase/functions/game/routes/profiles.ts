// =============================================================================
// Player profiles: a player's own profile summary/details/targeting
// preferences, the public player-by-username view, admin's player-badges
// overview, and admin CRUD on player accounts (create/edit/delete).
// Extracted wholesale out of game/index.ts; behavior is unchanged.
// =============================================================================
import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requireAuth, requireAdmin } from '../../_shared/auth.ts'
import { parseJsonArr } from '../../_shared/card_helpers.ts'
import { getBadge } from '../../_shared/badges.ts'
import { RouteHandler } from '../route_types.ts'
import bcrypt from 'npm:bcryptjs@2'

// The check-then-insert/update race above every users write below (SELECT for
// a conflict, then write if none was found) has a window two concurrent
// requests can both pass. users_email_unique / users_username_unique
// (migration 20260708000000) are the real backstop — this turns the
// resulting Postgres unique-violation into the same friendly message the
// common-case pre-check already returns, instead of a raw 500.
function friendlyUsersConflictError(error: { code?: string; message?: string } | null): string | null {
  if (!error || error.code !== '23505') return null
  if (error.message?.includes('users_email_unique')) return 'An account with this email already exists.'
  if (error.message?.includes('users_username_unique')) return 'This username is already taken.'
  return 'That email or username is already in use.'
}

export const handleProfilesRoutes: RouteHandler = async ({ req, path, method, authUser, supabase }) => {
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

  // ── GET /players/:username ────────────────────────────────────────────────
  // Viewable by any registered player (requireAuth, not self-only) — deliberately
  // narrower than /leaderboard/players' display_name (which can include a real
  // name): a profile only ever shows the username, never first/last name, and
  // never city — just country — matching the stricter privacy bar set for Share
  // My Impact and Community Voices rather than the older Leaderboard convention.
  const playerProfileMatch = path.match(/^\/players\/([^/]+)$/)
  if (method === 'GET' && playerProfileMatch) {
    const me = requireAuth(authUser)
    const lookupUsername = decodeURIComponent(playerProfileMatch[1])

    // "me" is a self-referencing alias (no username lookup needed) so the
    // frontend can link to "my profile" without having to know its own
    // username — the page then swaps the URL to the real username once loaded.
    const profileQuery = supabase
      .from('users')
      .select('id, username, player_number, created_at, current_streak_days, longest_streak_days, country_id')
    const { data: targetUser } = lookupUsername.toLowerCase() === 'me'
      ? await profileQuery.eq('id', me.sub).maybeSingle()
      : await profileQuery.ilike('username', lookupUsername).maybeSingle()
    if (!targetUser || !targetUser.username) return errorResponse('Player not found', 404)

    const { data: cards } = await supabase
      .from('player_cards')
      .select('completed_cells, purchased_cells, referral_cells')
      .eq('user_id', targetUser.id)

    let totalDeeds = 0
    for (const card of (cards ?? [])) {
      const completed: number[] = Array.isArray(card.completed_cells) ? card.completed_cells : parseJsonArr(card.completed_cells)
      const purchased: number[] = Array.isArray(card.purchased_cells) ? card.purchased_cells : parseJsonArr(card.purchased_cells)
      const referral: number[] = Array.isArray(card.referral_cells) ? card.referral_cells : parseJsonArr(card.referral_cells)
      const purchasedSet = new Set(purchased)
      const referralSet = new Set(referral)
      for (const idx of completed) {
        if (!purchasedSet.has(idx) && !referralSet.has(idx) && idx !== 12) totalDeeds++
      }
    }
    // Matches /leaderboard/players' fuller "all-time deeds" definition
    // (cards + quick taps) — note this is a wider count than /my-profile's
    // own badge (cards only, no quick taps), a pre-existing inconsistency
    // between those two endpoints that this doesn't attempt to fix.
    const { count: quickTapCount } = await supabase
      .from('quick_deed_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', targetUser.id)
    totalDeeds += quickTapCount ?? 0

    const badge = getBadge(totalDeeds)

    const { data: teamMembership } = await supabase
      .from('team_members').select('team_id').eq('user_id', targetUser.id).maybeSingle()
    let teamName: string | null = null
    if (teamMembership?.team_id) {
      const { data: t } = await supabase.from('teams').select('team_name').eq('id', teamMembership.team_id).maybeSingle()
      teamName = t?.team_name ?? null
    }

    let countryName: string | null = null
    if (targetUser.country_id) {
      const { data: c } = await supabase.from('countries').select('name').eq('id', targetUser.country_id).maybeSingle()
      countryName = c?.name ?? null
    }

    return jsonResponse({
      username: targetUser.username,
      player_number: targetUser.player_number,
      member_since: targetUser.created_at,
      total_deeds: totalDeeds,
      badge_name: badge.name,
      badge_emoji: badge.emoji,
      next_badge_name: badge.next_name,
      next_badge_emoji: badge.next_emoji,
      deeds_to_next_badge: badge.deeds_to_next,
      current_streak_days: targetUser.current_streak_days ?? 0,
      longest_streak_days: targetUser.longest_streak_days ?? 0,
      country_name: countryName,
      team_name: teamName,
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

  // ── GET /targeting-attributes (player-facing, no admin required) ─────────
  if (method === 'GET' && path === '/targeting-attributes') {
    requireAuth(authUser)
    const { data: attrs } = await supabase
      .from('targeting_attributes').select('id, name, display_order')
      .eq('is_active', true).order('display_order')
    const { data: vals } = await supabase
      .from('targeting_values').select('id, attribute_id, label, description, is_default, display_order')
      .eq('is_active', true).order('display_order')
    const valsByAttr = new Map<number, typeof vals>()
    for (const v of vals ?? []) {
      if (!valsByAttr.has(v.attribute_id)) valsByAttr.set(v.attribute_id, [])
      valsByAttr.get(v.attribute_id)!.push(v)
    }
    const attributes = (attrs ?? []).map((a) => ({
      id: a.id, name: a.name, display_order: a.display_order,
      values: valsByAttr.get(a.id) ?? [],
    }))
    return jsonResponse({ attributes })
  }

  // ── GET /my-profile/targeting ─────────────────────────────────────────────
  if (method === 'GET' && path === '/my-profile/targeting') {
    const user = requireAuth(authUser)
    const { data } = await supabase
      .from('user_targeting_values').select('targeting_value_id').eq('user_id', user.sub)
    return jsonResponse({ targeting_value_ids: (data ?? []).map((r) => Number(r.targeting_value_id)) })
  }

  // ── PUT /my-profile/targeting ─────────────────────────────────────────────
  if (method === 'PUT' && path === '/my-profile/targeting') {
    const user = requireAuth(authUser)
    const body = await req.json()
    const ids: number[] = (body.targeting_value_ids ?? []).map(Number).filter((n: number) => Number.isFinite(n) && n > 0)
    await supabase.from('user_targeting_values').delete().eq('user_id', user.sub)
    if (ids.length > 0) {
      const rows = ids.map((v) => ({ user_id: user.sub, targeting_value_id: v }))
      const { error } = await supabase.from('user_targeting_values').insert(rows)
      if (error) throw error
    }
    return jsonResponse({ success: true })
  }

  // ── GET /my-profile/details ───────────────────────────────────────────────
  if (method === 'GET' && path === '/my-profile/details') {
    const user = requireAuth(authUser)
    const { data: u } = await supabase
      .from('users')
      .select('first_name, last_name, username, email, city, country_id, state_id, player_number')
      .eq('id', user.sub)
      .maybeSingle()
    if (!u) return errorResponse('User not found', 404)
    return jsonResponse(u)
  }

  // ── PUT /my-profile ───────────────────────────────────────────────────────
  if (method === 'PUT' && path === '/my-profile') {
    const user = requireAuth(authUser)
    const body = await req.json()
    const { first_name, last_name, username, city, country_id, state_id } = body

    if (username) {
      const { data: existing } = await supabase
        .from('users').select('id').eq('username', username).neq('id', user.sub).maybeSingle()
      if (existing) return errorResponse('Username is already taken', 409)
    }

    const { error: profileErr } = await supabase.from('users').update({
      ...(first_name !== undefined && { first_name }),
      ...(last_name !== undefined && { last_name }),
      ...(username !== undefined && { username }),
      ...(city !== undefined && { city }),
      ...(country_id !== undefined && { country_id }),
      ...(state_id !== undefined && { state_id }),
    }).eq('id', user.sub)

    if (profileErr) {
      const friendly = friendlyUsersConflictError(profileErr)
      if (friendly) return errorResponse(friendly, 409)
      throw profileErr
    }

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
    requireAdmin(authUser)
    const body = await req.json()

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
    if (error) {
      const friendly = friendlyUsersConflictError(error)
      if (friendly) return errorResponse(friendly, 409)
      throw error
    }
    return jsonResponse({ success: true, user_id: userId })
  }

  // ── PUT /admin/players/:id ────────────────────────────────────────────────
  const adminPlayerPutMatch = method === 'PUT' && path.match(/^\/admin\/players\/([^/]+)$/)
  if (adminPlayerPutMatch) {
    requireAdmin(authUser)
    const targetId = adminPlayerPutMatch[1]
    const body = await req.json()

    const { first_name, last_name, email, username, city, country_id, state_id, role } = body

    if (email) {
      const { data: existing } = await supabase.from('users').select('id').eq('email', email).neq('id', targetId).maybeSingle()
      if (existing) return errorResponse('Email already in use', 409)
    }
    if (username) {
      const { data: existing } = await supabase.from('users').select('id').eq('username', username).neq('id', targetId).maybeSingle()
      if (existing) return errorResponse('Username already taken', 409)
    }

    const { error: playerUpdateErr } = await supabase.from('users').update({
      ...(first_name !== undefined && { first_name }),
      ...(last_name !== undefined && { last_name }),
      ...(email !== undefined && { email }),
      ...(username !== undefined && { username }),
      ...(city !== undefined && { city }),
      ...(country_id !== undefined && { country_id }),
      ...(state_id !== undefined && { state_id }),
      ...(role !== undefined && { role }),
      ...('is_trusted' in body && { is_trusted: body.is_trusted === true }),
      ...('is_test' in body && { is_test: body.is_test === true }),
      ...('is_active' in body && { is_active: body.is_active === true }),
    }).eq('id', targetId)

    if (playerUpdateErr) {
      const friendly = friendlyUsersConflictError(playerUpdateErr)
      if (friendly) return errorResponse(friendly, 409)
      throw playerUpdateErr
    }

    return jsonResponse({ success: true })
  }

  // ── DELETE /admin/players/:id ─────────────────────────────────────────────
  const adminPlayerDeleteMatch = method === 'DELETE' && path.match(/^\/admin\/players\/([^/]+)$/)
  if (adminPlayerDeleteMatch) {
    requireAdmin(authUser)
    const targetId = adminPlayerDeleteMatch[1]

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

  return null
}
