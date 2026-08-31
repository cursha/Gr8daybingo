// =============================================================================
// Card Pickup Prompts: the optional reflective question shown before a card
// is generated, players' answers, and admin management of both the question
// bank and the answer review queue (Community Voices only shows approved
// answers — see routes/public_stats.ts). Extracted wholesale out of
// game/index.ts; behavior is unchanged.
// =============================================================================
import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requireAuth, requireAdmin } from '../../_shared/auth.ts'
import { RouteHandler } from '../route_types.ts'

export const handleCardPickupPromptsRoutes: RouteHandler = async ({ req, method, path, authUser, supabase }) => {
  // ── GET /pickup-prompt ──────────────────────────────────────────────────
  // Player-facing: one random reflective question shown at the mode-picker
  // step before a card is generated. Answering is always optional — a null
  // id here just means the frontend skips the step entirely.
  if (method === 'GET' && path === '/pickup-prompt') {
    requireAuth(authUser)
    const { data } = await supabase
      .from('card_pickup_prompts').select('id, question_text')
      .eq('is_active', true).eq('status', 'Approved')
    if (!data || data.length === 0) return jsonResponse({ id: null, question_text: null })
    const picked = data[Math.floor(Math.random() * data.length)]
    return jsonResponse({ id: picked.id, question_text: picked.question_text })
  }

  // ── POST /pickup-prompt-response ────────────────────────────────────────
  // The frontend only calls this when the player actually typed an answer —
  // skipping never hits this endpoint, so there's nothing to distinguish
  // "skipped" from "never asked" here.
  if (method === 'POST' && path === '/pickup-prompt-response') {
    const user = requireAuth(authUser)
    const body = await req.json()
    const promptId = parseInt(body.prompt_id)
    const responseText = String(body.response_text ?? '').trim()
    if (!Number.isFinite(promptId)) return errorResponse('prompt_id required', 400)
    if (!responseText) return errorResponse('response_text required', 400)
    const { error } = await supabase.from('player_prompt_responses').insert({
      user_id: user.sub,
      prompt_id: promptId,
      response_text: responseText.slice(0, 1000),
    })
    if (error) return errorResponse(error.message, 400)
    return jsonResponse({ success: true })
  }

  // ── Admin: GET /admin/card-pickup-prompts ─────────────────────────────────
  if (method === 'GET' && path === '/admin/card-pickup-prompts') {
    requireAdmin(authUser)
    const { data } = await supabase.from('card_pickup_prompts').select('*').order('id')
    return jsonResponse({ prompts: data ?? [] })
  }

  // ── Admin: POST /admin/card-pickup-prompts ────────────────────────────────
  if (method === 'POST' && path === '/admin/card-pickup-prompts') {
    requireAdmin(authUser)
    const body = await req.json()
    const questionText = String(body.question_text ?? '').trim()
    if (!questionText) return errorResponse('question_text required', 400)
    const { data, error } = await supabase.from('card_pickup_prompts').insert({
      question_text: questionText,
      is_active: body.is_active !== false,
      status: body.status ?? 'Draft',
      updated_at: new Date().toISOString(),
    }).select().single()
    if (error) return errorResponse(error.message, 400)
    return jsonResponse({ prompt: data })
  }

  // ── Admin: PUT /admin/card-pickup-prompts/:id ─────────────────────────────
  const promptUpdateMatch = method === 'PUT' && path.match(/^\/admin\/card-pickup-prompts\/(\d+)$/)
  if (promptUpdateMatch) {
    requireAdmin(authUser)
    const id = parseInt(promptUpdateMatch[1])
    const body = await req.json()
    const { data: existingRow } = await supabase.from('card_pickup_prompts').select('id').eq('id', id).maybeSingle()
    if (!existingRow) return errorResponse('Prompt not found', 404)
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.question_text != null) {
      const trimmed = String(body.question_text).trim()
      if (!trimmed) return errorResponse('question_text cannot be empty', 400)
      updates.question_text = trimmed
    }
    if (body.is_active != null) updates.is_active = Boolean(body.is_active)
    if (body.status != null) {
      const VALID_STATUSES = ['Draft', 'Review', 'Approved', 'Retired']
      if (!VALID_STATUSES.includes(body.status)) return errorResponse('Invalid status', 400)
      updates.status = body.status
    }
    const { data, error } = await supabase.from('card_pickup_prompts').update(updates).eq('id', id).select().single()
    if (error) return errorResponse(error.message, 400)
    return jsonResponse({ prompt: data })
  }

  // ── Admin: DELETE /admin/card-pickup-prompts/:id ──────────────────────────
  const promptDeleteMatch = method === 'DELETE' && path.match(/^\/admin\/card-pickup-prompts\/(\d+)$/)
  if (promptDeleteMatch) {
    requireAdmin(authUser)
    const id = parseInt(promptDeleteMatch[1])
    const { data: existingRow } = await supabase.from('card_pickup_prompts').select('id').eq('id', id).maybeSingle()
    if (!existingRow) return errorResponse('Prompt not found', 404)
    await supabase.from('card_pickup_prompts').delete().eq('id', id)
    return jsonResponse({ success: true })
  }

  // ── Admin: GET /admin/prompt-responses ────────────────────────────────────
  // Review queue for player-typed reflection answers before any of them can
  // appear publicly in Community Voices — nothing goes live unapproved.
  if (method === 'GET' && path === '/admin/prompt-responses') {
    requireAdmin(authUser)
    // user_id has no FK to users (matches this table's existing convention
    // elsewhere in the codebase), so PostgREST can't embed it — resolve
    // manually, same pattern as /public/world-deeds below.
    const { data } = await supabase
      .from('player_prompt_responses')
      .select('id, user_id, prompt_id, response_text, is_approved_for_display, created_at, card_pickup_prompts(question_text)')
      .order('created_at', { ascending: false })
      .limit(200)
    const rows = (data ?? []) as unknown as {
      id: number; user_id: string; prompt_id: number; response_text: string
      is_approved_for_display: boolean; created_at: string
      card_pickup_prompts: { question_text: string } | null
    }[]
    const userIds = [...new Set(rows.map((r) => r.user_id))]
    const { data: usersData } = await supabase.from('users').select('id, username').in('id', userIds)
    const usernameById = new Map((usersData ?? []).map((u) => [u.id, u.username as string | null]))
    return jsonResponse({
      responses: rows.map((r) => ({
        id: r.id,
        question_text: r.card_pickup_prompts?.question_text ?? '',
        response_text: r.response_text,
        username: usernameById.get(r.user_id) ?? null,
        is_approved_for_display: r.is_approved_for_display,
        created_at: r.created_at,
      })),
    })
  }

  // ── Admin: PUT /admin/prompt-responses/:id ────────────────────────────────
  const promptResponseApproveMatch = method === 'PUT' && path.match(/^\/admin\/prompt-responses\/(\d+)$/)
  if (promptResponseApproveMatch) {
    requireAdmin(authUser)
    const id = parseInt(promptResponseApproveMatch[1])
    const body = await req.json()
    const { data: existingRow } = await supabase.from('player_prompt_responses').select('id').eq('id', id).maybeSingle()
    if (!existingRow) return errorResponse('Response not found', 404)
    const { data, error } = await supabase
      .from('player_prompt_responses')
      .update({ is_approved_for_display: Boolean(body.is_approved_for_display) })
      .eq('id', id).select().single()
    if (error) return errorResponse(error.message, 400)
    return jsonResponse({ response: data })
  }

  return null
}
