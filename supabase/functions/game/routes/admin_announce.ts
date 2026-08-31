// =============================================================================
// Admin: announcing a new week's game to every player by email, and a dry-run
// preview of the AI-written encouragement blurb used in the (currently
// unused, see _shared/game_launch_email.ts) new-game-launch email. Extracted
// wholesale out of game/index.ts; behavior is unchanged.
// =============================================================================
import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requireAdmin } from '../../_shared/auth.ts'
import { sendEmail, gameAnnouncementEmail } from '../../_shared/email.ts'
import { callAnthropicForText } from '../../_shared/anthropic.ts'
import { getCurrentWeekYear, getWeekStart } from '../../_shared/week.ts'
import { DEFAULT_ANNOUNCE_PROMPT_TEMPLATE, generateEncouragementBlurbs } from '../../_shared/game_launch_email.ts'
import { RouteHandler } from '../route_types.ts'

export const handleAdminAnnounceRoutes: RouteHandler = async ({ req, url, method, path, authUser, supabase }) => {
  // ── POST /admin/announce-game ─────────────────────────────────────────────
  if (method === 'POST' && path === '/admin/announce-game') {
    requireAdmin(authUser)
    const body = await req.json()
    const { prize, game_type, theme, extra_message } = body as {
      prize: string
      game_type: string
      theme: string
      extra_message?: string
    }
    if (!prize || !game_type) {
      return errorResponse('prize and game_type are required', 400)
    }

    // If the admin left "Additional Message" blank, offer to have Claude
    // write one from the prize/game type/theme — purely a nice-to-have
    // flourish, so any failure (no key, bad response) just falls back to
    // no extra message rather than blocking the send. Network call, 5s
    // timeout, and thinking-disabled behavior come from the shared
    // callAnthropicForText helper.
    let effectiveExtraMessage = extra_message
    if (!effectiveExtraMessage?.trim()) {
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
      if (anthropicKey) {
        const { data: promptCfg } = await supabase
          .from('game_configs').select('config_value').eq('config_key', 'game_announcement_prompt_template').maybeSingle()
        const template = promptCfg?.config_value?.trim() || DEFAULT_ANNOUNCE_PROMPT_TEMPLATE
        const prompt = template
          .replaceAll('{{PRIZE}}', prize)
          .replaceAll('{{GAME_TYPE}}', game_type)
          .replaceAll('{{THEME}}', theme || 'none set this week')

        const result = await callAnthropicForText(anthropicKey, { prompt, maxTokens: 300 })
        if (result.ok) {
          effectiveExtraMessage = result.text
        } else {
          console.error('[announce-game] AI extra-message generation failed:', result.reason)
        }
      }
    }

    const { data: players, error: playersErr } = await supabase
      .from('users')
      .select('email, first_name, name, username')
      .eq('email_verified', true)
      .eq('role', 'user')
      .eq('is_active', true)

    if (playersErr) throw playersErr
    if (!players || players.length === 0) {
      return jsonResponse({ success: true, sent: 0, failed: 0, message: 'No players to notify.' })
    }

    let sent = 0
    let failed = 0
    for (const player of players) {
      const displayName = player.first_name ?? player.name ?? player.username ?? null
      const tpl = gameAnnouncementEmail({ name: displayName, prize, gameType: game_type, theme, extraMessage: effectiveExtraMessage })
      const result = await sendEmail({ to: player.email, subject: tpl.subject, html: tpl.html })
      if (result.sent) sent++
      else failed++
    }

    return jsonResponse({ success: true, sent, failed, ai_generated_extra_message: effectiveExtraMessage !== extra_message })
  }

  // ── GET /admin/test-encouragement-blurb ────────────────────────────────────
  // Dry run for the new-game-launch encouragement blurbs (see
  // ENCOURAGEMENT_PROMPT_ACTIVE / ENCOURAGEMENT_PROMPT_ZERO /
  // generateEncouragementBlurbs in _shared/game_launch_email.ts).
  // Generates each variant 5-10 times (default 8, override with ?count=) so
  // Curt can review tone, word count, and variety before it's live.
  // {{DEED_COUNT}} is substituted with a representative placeholder (3)
  // since a dry run has no specific player; {{COMMUNITY_COUNT}} uses this
  // week's real last-week community total. Never touches recipients, never
  // sends anything, never claims game_launch_notifications.
  if (method === 'GET' && path === '/admin/test-encouragement-blurb') {
    requireAdmin(authUser)
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      return jsonResponse({ dry_run: true, error: 'ANTHROPIC_API_KEY not configured' })
    }
    const countParam = parseInt(url.searchParams.get('count') ?? '8')
    const runs = Number.isFinite(countParam) ? Math.min(Math.max(countParam, 5), 10) : 8

    const currentWeekStart = getWeekStart(getCurrentWeekYear())
    const lastWeekStart = new Date(currentWeekStart.getTime() - 7 * 86_400_000)
    const { count: communityDeedsLastWeek } = await supabase
      .from('completed_deeds')
      .select('id', { count: 'exact', head: true })
      .eq('is_hidden_from_impact_board', false)
      .gte('completed_at', lastWeekStart.toISOString())
      .lt('completed_at', currentWeekStart.toISOString())
    const EXAMPLE_DEED_COUNT = 3

    const results = []
    for (let i = 0; i < runs; i++) {
      const { active, zero } = await generateEncouragementBlurbs(anthropicKey)
      for (const [variant, tpl, token, value] of [
        ['active', active, '{{DEED_COUNT}}', EXAMPLE_DEED_COUNT] as const,
        ['zero', zero, '{{COMMUNITY_COUNT}}', communityDeedsLastWeek ?? 0] as const,
      ]) {
        const text = tpl.template.replaceAll(token, String(value))
        results.push({
          run: i + 1,
          variant,
          word_count: text.trim() ? text.trim().split(/\s+/).length : 0,
          text,
          source: tpl.source,
          fallback_reason: tpl.fallback_reason ?? null,
        })
      }
    }
    return jsonResponse({ dry_run: true, example_deed_count: EXAMPLE_DEED_COUNT, community_deeds_last_week: communityDeedsLastWeek ?? 0, results })
  }

  return null
}
