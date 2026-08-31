// =============================================================================
// The AI-written encouragement blurb used in the new-game-launch email, and
// the (currently unused — see sendGameLaunchEmails below) batch sender for
// it. Shared with routes/admin_announce.ts's dry-run preview endpoint.
// =============================================================================
import { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { callAnthropicForText } from './anthropic.ts'
import { sendEmail, newGameLaunchEmail } from './email.ts'
import { getWeekStart } from './week.ts'

// Admin-editable via game_configs.game_announcement_prompt_template (Admin
// Panel → Announce New Game to All Players). Only used when the admin leaves
// "Additional Message" blank — see POST /admin/announce-game.
export const DEFAULT_ANNOUNCE_PROMPT_TEMPLATE = `You write a short, warm note to include in this week's Havagr8day Bingo game announcement email, sent to every player when a new week's game starts.

This week's details:
Prize: {{PRIZE}}
Game Type: {{GAME_TYPE}}
Theme: {{THEME}}

Write 2-3 warm, genuine, playful sentences (plain text, no markdown, no quotes) getting players excited for this week's game. Vary your wording and angle each time you're called — don't just restate the prize/game type/theme as a list, weave them in naturally.

Respond with ONLY the note text, nothing else.`

// ── AI encouragement blurb for the new-game-launch email ───────────────────
// Edit these prompts freely — they're isolated from the call/validation
// logic below. Two variants, each generated ONCE per card-generation cycle
// (not once per recipient) by generateEncouragementBlurbs — not personalized
// text, just a shared template per variant selected per recipient by whether
// they logged any deeds last week. See sendGameLaunchEmails, the only
// caller, for the last-week window (Monday-Sunday, the week just ended) and
// per-player counting.
//
// ACTIVE: for players who logged at least one deed last week. Must weave in
// the literal placeholder token {{DEED_COUNT}} naturally (e.g. "you logged
// {{DEED_COUNT}} good deeds last week") — substituted with their real count
// afterward, so it must read correctly for any positive integer.
const ENCOURAGEMENT_PROMPT_ACTIVE = `Write a short, warm encouragement message (50-75 words) for players of HavaGr8Day, a kindness-themed game where players complete real-world good deeds to fill a bingo card. This message will appear in the email announcing a brand new card for the week. The recipient logged at least one good deed last week — acknowledge that specifically by including the exact literal placeholder token {{DEED_COUNT}} naturally in the message (e.g. "you logged {{DEED_COUNT}} good deeds last week" — vary the phrasing each time you're called; the token will be replaced with their real number, which could be any positive integer, so phrase it so it reads correctly regardless of the number). Then look forward to the fresh card ahead. The tone should be genuine and specific to the spirit of the game, never generic praise or corporate-sounding. Do not use exclamation points more than once. Do not mention money, prizes, or competition — this is about the value of doing good, not winning. Return ONLY the message text, no preamble, no quotation marks.`

// ZERO: for players who logged no deeds last week (including brand-new
// players who have never logged one). Must NOT thank them for anything or
// imply any activity of theirs — instead names the community's total via
// the literal placeholder token {{COMMUNITY_COUNT}} as a gentle nudge that
// others are active, then looks forward to the fresh card ahead.
const ENCOURAGEMENT_PROMPT_ZERO = `Write a short, warm encouragement message (50-75 words) for players of HavaGr8Day, a kindness-themed game where players complete real-world good deeds to fill a bingo card. This message will appear in the email announcing a brand new card for the week. The recipient logged zero good deeds last week (some have never logged one at all) — do NOT thank them for anything or imply they did anything, and do not mention a deed count for them personally. Instead, gently let them know others are active: include the exact literal placeholder token {{COMMUNITY_COUNT}} naturally in the message as the number of good deeds the whole Havagr8day community logged last week (e.g. "the community logged {{COMMUNITY_COUNT}} good deeds last week" — vary the phrasing each time you're called; the token will be replaced with the real number, which could be any positive integer, so phrase it so it reads correctly regardless of the number), framed as an invitation to join in, never as guilt or pressure. Then look forward to the fresh card ahead. The tone should be genuine and specific to the spirit of the game, never generic praise or corporate-sounding. Do not use exclamation points more than once. Do not mention money, prizes, or competition — this is about the value of doing good, not winning. Return ONLY the message text, no preamble, no quotation marks.`

// Used whenever the AI call fails, times out, or returns something outside
// the accepted word-count range — see generateEncouragementBlurbs below.
// These are plain templates (not AI output), so the {{TOKEN}} substitution
// is always accurate even when the AI call itself failed.
const FALLBACK_ENCOURAGEMENT_ACTIVE = "You logged {{DEED_COUNT}} good deeds last week — thank you for showing up for your community like that. This week's card is fresh: twenty-five new squares, waiting for twenty-five more real moments of kindness only you can create."
const FALLBACK_ENCOURAGEMENT_ZERO = "The Havagr8day community logged {{COMMUNITY_COUNT}} good deeds last week. This week's card is fresh — twenty-five blank squares, waiting for twenty-five real moments of kindness only you can create. There's no wrong way to start: hold a door, check on a neighbour, say the thing you've been meaning to say."

export type EncouragementTemplate = { template: string; source: 'ai' | 'fallback'; fallback_reason?: string }

/** Generates both encouragement templates for this cycle's new-game-launch
 *  email — ACTIVE (for players with deeds last week) and ZERO (for players
 *  without). Always resolves — never throws — so a slow/failed/malformed/
 *  out-of-range response falls back to the matching static template rather
 *  than blocking the send. Each template still contains its {{TOKEN}}
 *  unsubstituted — the caller fills in the real per-player/community number.
 *  Word-count validation (40-90) is specific to this call site and lives
 *  here; the network call, 5s timeout, and thinking-disabled behavior are
 *  shared — see callAnthropicForText. Two Anthropic calls per cycle total,
 *  not per recipient. */
export async function generateEncouragementBlurbs(
  anthropicKey: string,
): Promise<{ active: EncouragementTemplate; zero: EncouragementTemplate }> {
  async function generate(
    prompt: string,
    fallback: string,
    label: 'active' | 'zero',
  ): Promise<EncouragementTemplate> {
    const result = await callAnthropicForText(anthropicKey, { prompt, maxTokens: 150 })
    if (!result.ok) {
      console.error(`[game-launch-email] encouragement (${label}) call failed:`, result.reason)
      return { template: fallback, source: 'fallback', fallback_reason: result.reason }
    }
    // Word-count check runs on the raw AI text, token included — the token
    // is a couple of words at most, well inside the tolerance either way.
    const wordCount = result.text.split(/\s+/).length
    if (wordCount < 40 || wordCount > 90) {
      console.error(`[game-launch-email] encouragement (${label}) output failed validation: word_count_${wordCount}`)
      return { template: fallback, source: 'fallback', fallback_reason: `word_count_${wordCount}` }
    }
    return { template: result.text, source: 'ai' }
  }

  const [active, zero] = await Promise.all([
    generate(ENCOURAGEMENT_PROMPT_ACTIVE, FALLBACK_ENCOURAGEMENT_ACTIVE, 'active'),
    generate(ENCOURAGEMENT_PROMPT_ZERO, FALLBACK_ENCOURAGEMENT_ZERO, 'zero'),
  ])
  return { active, zero }
}

/** Sends the "new game launch" email to every verified player, once per game
 *  cycle — see /generate-card, which is the only caller and only invokes this
 *  once it has atomically won the per-week_year claim in
 *  game_launch_notifications. Never throws: failures are logged per-recipient
 *  so one bad address can't take down the rest of the batch.
 *
 *  NOTE: not currently called anywhere — the "new game launched" batch email
 *  was premised on everyone's cards dropping together on a shared weekly
 *  boundary. Now that card generation is per-player and async (tap-out/
 *  bingo-driven, not calendar-driven), there's no shared "launch moment"
 *  left to broadcast. Left here in case a deliberate first-card welcome
 *  email is wanted later. */
export async function sendGameLaunchEmails(supabase: SupabaseClient, weekYear: string): Promise<void> {
  const { data: players, error: playersErr } = await supabase
    .from('users')
    .select('id, email, first_name, name, username')
    .eq('email_verified', true)
    .eq('role', 'user')
    .eq('is_active', true)

  if (playersErr) {
    console.error('[game-launch-email] failed to load recipients', playersErr)
    return
  }
  if (!players || players.length === 0) return

  // "Last week" = the Monday-Sunday cycle that just ended, i.e. the 7 days
  // immediately before the new week (weekYear) that just started — not a
  // rolling now-7-days window, to match this app's existing week_year
  // convention (see getWeekStart).
  const currentWeekStart = getWeekStart(weekYear)
  const lastWeekStart = new Date(currentWeekStart.getTime() - 7 * 86_400_000)
  const lastWeekStartIso = lastWeekStart.toISOString()
  const currentWeekStartIso = currentWeekStart.toISOString()

  const { data: lastWeekDeeds } = await supabase
    .from('completed_deeds')
    .select('player_id')
    .eq('is_hidden_from_impact_board', false)
    .gte('completed_at', lastWeekStartIso)
    .lt('completed_at', currentWeekStartIso)

  const communityDeedsLastWeek = lastWeekDeeds?.length ?? 0
  const perPlayerDeedsLastWeek = new Map<string, number>()
  for (const d of lastWeekDeeds ?? []) {
    perPlayerDeedsLastWeek.set(d.player_id, (perPlayerDeedsLastWeek.get(d.player_id) ?? 0) + 1)
  }

  // Generated ONCE for this whole batch, not per recipient — two Anthropic
  // calls total (active + zero variants), reused across every email below.
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  const templates = anthropicKey
    ? await generateEncouragementBlurbs(anthropicKey)
    : {
        active: { template: FALLBACK_ENCOURAGEMENT_ACTIVE, source: 'fallback' as const, fallback_reason: 'anthropic_key_not_configured' },
        zero: { template: FALLBACK_ENCOURAGEMENT_ZERO, source: 'fallback' as const, fallback_reason: 'anthropic_key_not_configured' },
      }
  if (!anthropicKey) console.error('[game-launch-email] ANTHROPIC_API_KEY not configured, using fallback encouragement lines')

  let sent = 0
  let failed = 0
  let activeVariantUsed = 0
  for (const player of players) {
    const firstName = player.first_name ?? player.name ?? player.username ?? null
    const deedsLastWeek = perPlayerDeedsLastWeek.get(player.id) ?? 0
    const encouragement = deedsLastWeek > 0
      ? templates.active.template.replaceAll('{{DEED_COUNT}}', String(deedsLastWeek))
      : templates.zero.template.replaceAll('{{COMMUNITY_COUNT}}', String(communityDeedsLastWeek))
    if (deedsLastWeek > 0) activeVariantUsed++
    try {
      const tpl = newGameLaunchEmail(firstName, encouragement)
      const result = await sendEmail({ to: player.email, subject: tpl.subject, html: tpl.html })
      if (result.sent) sent++
      else failed++
    } catch (err) {
      failed++
      console.error('[game-launch-email] send failed for', player.email, err)
    }
  }
  console.log(`[game-launch-email] week ${weekYear}: sent=${sent} failed=${failed} active_variant=${activeVariantUsed} zero_variant=${players.length - activeVariantUsed} community_deeds_last_week=${communityDeedsLastWeek} active_source=${templates.active.source}${templates.active.fallback_reason ? ` (${templates.active.fallback_reason})` : ''} zero_source=${templates.zero.source}${templates.zero.fallback_reason ? ` (${templates.zero.fallback_reason})` : ''}`)
}
