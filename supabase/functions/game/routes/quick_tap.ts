// =============================================================================
// Quick Tap: the lightweight deed-logging shortcut (both the player's
// personal 1-3 "good deeds" quick taps and the separate admin-configured
// quick_deeds button set), plus the weekly spotlight deed and deed
// categories admin. Extracted wholesale out of game/index.ts; behavior is
// unchanged.
// =============================================================================
import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requireAuth, requireAdmin } from '../../_shared/auth.ts'
import { getCurrentWeekYear } from '../../_shared/week.ts'
import { checkDeedGate, recordCompletedDeed, updatePlayerStreak } from '../../_shared/deed_completion.ts'
import { awardDeedEntry } from '../../_shared/draw.ts'
import { RouteHandler } from '../route_types.ts'

export const handleQuickTapRoutes: RouteHandler = async ({ req, method, path, authUser, supabase }) => {
  // ── GET /quick-tap-deeds/eligible ────────────────────────────────────────
  if (method === 'GET' && path === '/quick-tap-deeds/eligible') {
    requireAuth(authUser)
    const { data } = await supabase
      .from('good_deeds')
      .select('id, deed_text, deed_text_long, category, quick_tap_label')
      .eq('quick_tap_eligible', true)
      .eq('is_active', true)
      .eq('status', 'Approved')
      .not('quick_tap_label', 'is', null)
      .order('deed_text')
    return jsonResponse({ deeds: data ?? [] })
  }

  // ── GET /my-quick-taps ────────────────────────────────────────────────────
  if (method === 'GET' && path === '/my-quick-taps') {
    const user = requireAuth(authUser)
    const { data: custom } = await supabase
      .from('user_quick_tap_deeds')
      .select('deed_id, position, good_deeds(id, deed_text, deed_text_long, category, quick_tap_label, quick_tap_eligible, is_active, status)')
      .eq('user_id', user.sub)
      .order('position')
    const customDeeds = (custom ?? [])
      .map((r) => r.good_deeds as unknown as { id: number; deed_text: string; deed_text_long: string | null; category: string; quick_tap_label: string | null; quick_tap_eligible: boolean; is_active: boolean; status: string } | null)
      .filter((d): d is NonNullable<typeof d> => d != null && d.quick_tap_eligible && d.is_active && d.status === 'Approved' && d.quick_tap_label != null)
    if (customDeeds.length > 0) {
      return jsonResponse({ source: 'custom', deeds: customDeeds.map((d) => ({ id: d.id, deed_text: d.deed_text, deed_text_long: d.deed_text_long, category: d.category, quick_tap_label: d.quick_tap_label })) })
    }
    const { data: defaults } = await supabase
      .from('good_deeds')
      .select('id, deed_text, deed_text_long, category, quick_tap_label')
      .eq('quick_tap_eligible', true)
      .eq('quick_tap_default', true)
      .eq('is_active', true)
      .eq('status', 'Approved')
      .not('quick_tap_label', 'is', null)
      .order('deed_text')
    return jsonResponse({ source: 'default', deeds: defaults ?? [] })
  }

  // ── PUT /my-quick-taps ────────────────────────────────────────────────────
  if (method === 'PUT' && path === '/my-quick-taps') {
    const user = requireAuth(authUser)
    const body = await req.json()
    const deedIds: number[] = (body.deed_ids ?? []).map(Number).filter((n: number) => Number.isFinite(n) && n > 0)
    if (deedIds.length < 1 || deedIds.length > 3) return errorResponse('Choose 1 to 3 deeds', 400)
    const { data: valid } = await supabase
      .from('good_deeds').select('id').in('id', deedIds).eq('quick_tap_eligible', true).eq('is_active', true).eq('status', 'Approved').not('quick_tap_label', 'is', null)
    if ((valid ?? []).length !== deedIds.length) return errorResponse('One or more deeds are not eligible', 400)
    await supabase.from('user_quick_tap_deeds').delete().eq('user_id', user.sub)
    await supabase.from('user_quick_tap_deeds').insert(deedIds.map((id, i) => ({ user_id: user.sub, deed_id: id, position: i })))
    return jsonResponse({ success: true })
  }

  // ── POST /quick-taps/:deedId/tap ─────────────────────────────────────────
  const quickTapMatch = path.match(/^\/quick-taps\/(\d+)\/tap$/)
  if (method === 'POST' && quickTapMatch) {
    const user = requireAuth(authUser)
    const deedId = parseInt(quickTapMatch[1])
    const { data: deed } = await supabase.from('good_deeds').select('is_active, quick_tap_eligible, status').eq('id', deedId).maybeSingle()
    if (!deed?.is_active || !deed?.quick_tap_eligible || deed?.status !== 'Approved') return errorResponse('Deed not available for Quick Tap', 400)
    const gate = await checkDeedGate(supabase, user)
    if (!gate.allowed) return errorResponse(gate.message ?? 'Daily deed limit reached', 429)
    const completedId = await recordCompletedDeed(supabase, { playerId: user.sub, sourceType: 'quick_action', deedId })
    if (completedId != null) {
      await awardDeedEntry(supabase, { completedDeedId: completedId, playerId: user.sub, weekYear: getCurrentWeekYear(), sourceType: 'quick_action' })
    }
    const streakResult = await updatePlayerStreak(supabase, user.sub)
    const resp: Record<string, unknown> = { success: true }
    if (streakResult.streak_updated) {
      resp.streak_update = { current_streak_days: streakResult.current_streak_days, longest_streak_days: streakResult.longest_streak_days, new_milestones: streakResult.new_milestones }
    }
    return jsonResponse(resp)
  }

  // ── GET /spotlight-quick-tap ───────────────────────────────────────────────
  // Player-facing: only ever returns a deed while its stamped week matches
  // the current one — that's the entire expiry mechanism, no cleanup step.
  if (method === 'GET' && path === '/spotlight-quick-tap') {
    requireAuth(authUser)
    const { data } = await supabase
      .from('admin_spotlight_quick_tap')
      .select('deed_id, week_year, good_deeds(id, deed_text, deed_text_long, category, quick_tap_label)')
      .eq('id', 1).maybeSingle()

    const deed = data?.good_deeds as unknown as { id: number; deed_text: string; deed_text_long: string | null; category: string; quick_tap_label: string | null } | null
    if (!data || data.week_year !== getCurrentWeekYear() || !deed || deed.quick_tap_label == null) {
      return jsonResponse({ deed: null })
    }
    return jsonResponse({ deed })
  }

  // ── Admin: POST /admin/spotlight-quick-tap ────────────────────────────────
  // Re-POSTing with a different deed_id replaces the current spotlight deed
  // early — no separate "clear" endpoint. It only disappears on its own once
  // the week rolls over and admin hasn't set a new one for the new week.
  if (method === 'POST' && path === '/admin/spotlight-quick-tap') {
    requireAdmin(authUser)
    const body = await req.json()
    const deedId = parseInt(body.deed_id)
    if (!Number.isFinite(deedId)) return errorResponse('deed_id required', 400)

    const { data: deed } = await supabase
      .from('good_deeds').select('id').eq('id', deedId)
      .eq('quick_tap_eligible', true).eq('is_active', true).eq('status', 'Approved')
      .not('quick_tap_label', 'is', null)
      .maybeSingle()
    if (!deed) return errorResponse('Deed must be an active, approved, Quick-Tap-eligible deed with a Quick Tap label set', 400)

    await supabase.from('admin_spotlight_quick_tap').update({
      deed_id: deedId,
      week_year: getCurrentWeekYear(),
      set_at: new Date().toISOString(),
    }).eq('id', 1)

    return jsonResponse({ success: true })
  }

  // ── Admin: GET /admin/spotlight-quick-tap ─────────────────────────────────
  if (method === 'GET' && path === '/admin/spotlight-quick-tap') {
    requireAdmin(authUser)
    const { data } = await supabase
      .from('admin_spotlight_quick_tap')
      .select('deed_id, week_year, set_at, good_deeds(id, deed_text, category)')
      .eq('id', 1).maybeSingle()
    return jsonResponse({
      active: data?.week_year === getCurrentWeekYear(),
      deed: data?.good_deeds ?? null,
      week_year: data?.week_year ?? null,
    })
  }

  // ── GET /quick-deeds ─────────────────────────────────────────────────────
  if (method === 'GET' && path === '/quick-deeds') {
    const { data } = await supabase
      .from('quick_deeds')
      .select('id, label, emoji, display_order')
      .eq('is_active', true)
      .order('display_order')
    return jsonResponse({ quick_deeds: data ?? [] })
  }

  // ── POST /quick-deeds/:id/tap ─────────────────────────────────────────────
  const quickDeedTapMatch = path.match(/^\/quick-deeds\/(\d+)\/tap$/)
  if (method === 'POST' && quickDeedTapMatch) {
    const user = requireAuth(authUser)
    const deedId = parseInt(quickDeedTapMatch[1])

    // Referral gating: non-referred players are capped at N deeds / 24h.
    const qGate = await checkDeedGate(supabase, user)
    if (!qGate.allowed) return errorResponse(qGate.message ?? 'Daily deed limit reached', 429)

    const { error } = await supabase
      .from('quick_deed_logs')
      .insert({ user_id: user.sub, quick_deed_id: deedId })
    if (error) throw error

    // Impact Board: a quick action is a completed deed (best-effort, non-blocking)
    const quickDeedId = await recordCompletedDeed(supabase, {
      playerId: user.sub,
      sourceType: 'quick_action',
      quickDeedId: deedId,
    })

    // Weekly Draw: award a draw entry for this quick-tap deed (idempotent, gated).
    if (quickDeedId != null) {
      await awardDeedEntry(supabase, {
        completedDeedId: quickDeedId, playerId: user.sub, weekYear: getCurrentWeekYear(),
        sourceType: 'quick_action',
      })
    }

    // Update daily streak
    const streakResult = await updatePlayerStreak(supabase, user.sub)
    const resp: Record<string, unknown> = { success: true }
    if (streakResult.streak_updated) {
      resp.streak_update = {
        current_streak_days: streakResult.current_streak_days,
        longest_streak_days: streakResult.longest_streak_days,
        new_milestones: streakResult.new_milestones,
      }
    }
    return jsonResponse(resp)
  }

  // ── GET /quick-deeds/my-stats ─────────────────────────────────────────────
  if (method === 'GET' && path === '/quick-deeds/my-stats') {
    const user = requireAuth(authUser)
    const { data } = await supabase
      .from('quick_deed_logs')
      .select('quick_deed_id, quick_deeds(label, emoji)')
      .eq('user_id', user.sub)
    // Count per deed
    const counts: Record<number, { label: string; emoji: string; count: number }> = {}
    for (const row of (data ?? [])) {
      const id = row.quick_deed_id
      const deed = row.quick_deeds as unknown as { label: string; emoji: string } | null
      if (!counts[id]) counts[id] = { label: deed?.label ?? '', emoji: deed?.emoji ?? '', count: 0 }
      counts[id].count++
    }
    return jsonResponse({ stats: Object.values(counts) })
  }

  // ── Admin: GET /admin/deed-categories ────────────────────────────────────
  if (method === 'GET' && path === '/admin/deed-categories') {
    requireAdmin(authUser)
    const { data } = await supabase.from('deed_categories').select('*').order('name')
    return jsonResponse({ categories: data ?? [] })
  }

  // ── Admin: PUT /admin/deed-categories/:name ───────────────────────────────
  const catEditMatch = path.match(/^\/admin\/deed-categories\/([A-Z]+)$/)
  if (method === 'PUT' && catEditMatch) {
    requireAdmin(authUser)
    const name = catEditMatch[1]
    const body = await req.json()
    const updates: Record<string, unknown> = {}
    if (body.is_active !== undefined) updates.is_active = body.is_active
    if (body.description !== undefined) updates.description = body.description
    await supabase.from('deed_categories').update(updates).eq('name', name)
    return jsonResponse({ success: true })
  }

  // ── Admin: GET /admin/quick-deeds ────────────────────────────────────────
  if (method === 'GET' && path === '/admin/quick-deeds') {
    requireAdmin(authUser)
    const { data } = await supabase.from('quick_deeds').select('*').order('display_order')
    return jsonResponse({ quick_deeds: data ?? [] })
  }

  // ── Admin: POST /admin/quick-deeds ───────────────────────────────────────
  if (method === 'POST' && path === '/admin/quick-deeds') {
    requireAdmin(authUser)
    const body = await req.json()
    const { label, emoji, display_order } = body
    if (!label) return errorResponse('label is required', 400)
    const { data, error } = await supabase
      .from('quick_deeds')
      .insert({ label: String(label).trim(), emoji: emoji ?? '❤️', display_order: display_order ?? 0 })
      .select().single()
    if (error) throw error
    return jsonResponse({ success: true, quick_deed: data })
  }

  // ── Admin: PUT /admin/quick-deeds/:id ────────────────────────────────────
  const adminQdEditMatch = path.match(/^\/admin\/quick-deeds\/(\d+)$/)
  if (method === 'PUT' && adminQdEditMatch) {
    requireAdmin(authUser)
    const id = parseInt(adminQdEditMatch[1])
    const body = await req.json()
    const updates: Record<string, unknown> = {}
    if (body.label !== undefined) updates.label = String(body.label).trim()
    if (body.emoji !== undefined) updates.emoji = body.emoji
    if (body.display_order !== undefined) updates.display_order = body.display_order
    if (body.is_active !== undefined) updates.is_active = body.is_active
    await supabase.from('quick_deeds').update(updates).eq('id', id)
    return jsonResponse({ success: true })
  }

  // ── Admin: DELETE /admin/quick-deeds/:id ─────────────────────────────────
  const adminQdDeleteMatch = path.match(/^\/admin\/quick-deeds\/(\d+)$/)
  if (method === 'DELETE' && adminQdDeleteMatch) {
    requireAdmin(authUser)
    const id = parseInt(adminQdDeleteMatch[1])
    await supabase.from('quick_deeds').delete().eq('id', id)
    return jsonResponse({ success: true })
  }

  return null
}
