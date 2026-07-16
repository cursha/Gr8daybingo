import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getSupabase } from '../_shared/db.ts'
import { sendEmail } from '../_shared/email.ts'
import { weeklyMemberUpdateEmail, weeklyUpdateFailedAlertEmail } from '../_shared/email.ts'
import { callAnthropicForText } from '../_shared/anthropic.ts'

// Fixed in code, not admin-editable — the structural contract (JSON output,
// {{DEED_COUNT}} token, stat-picking instruction) that a prompt edit must
// never be able to break. Only the tone/style portion is admin-editable —
// see weekly_update_prompt in game_configs, appended at the end.
const FIXED_BASE_PROMPT = `You write the weekly email update for Havagr8day Bingo, a game where players complete real acts of kindness to mark bingo squares.

Generate both a subject line and a body for this week's update.

Requirements:
- Include the exact literal placeholder token {{DEED_COUNT}} naturally in the body, for the member's personal deed count this week (e.g. "You personally logged {{DEED_COUNT}} deeds this week" — vary the wording each time you're called)
- From the stat pool below, pick the 1-2 most interesting or notable stats to feature this week — don't just list all of them, choose what a member would actually find compelling
- Mention this week's Deed of the Week
- Keep the body short — this is a weekly email, not an essay
- Keep the subject line short (under ~50 characters) and specific to this week's content — avoid generic phrasing that would repeat week to week

Stat pool for this week:
{{STATS}}

Deed of the Week: {{SPOTLIGHT_DEED}}

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"subject": "...", "body": "..."}`

const DEFAULT_STYLE_GUIDANCE = 'Write in a warm, encouraging tone. Keep it under 100 words. Sound like a friendly community update, not a corporate newsletter.'

// Monday-based week start (UTC), matching the app's ISO-week convention.
function getCurrentWeekStart(): Date {
  const now = new Date()
  const day = now.getUTCDay() || 7 // Mon=1..Sun=7
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (day - 1)))
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Same ISO week-year convention used for admin_spotlight_quick_tap's
// expiry check elsewhere in the app (game/index.ts's getCurrentWeekYear).
function getCurrentWeekYear(): string {
  const now = new Date()
  const thursday = new Date(now)
  thursday.setDate(now.getDate() + (4 - (now.getDay() || 7)))
  const year = thursday.getFullYear()
  const jan1 = new Date(year, 0, 1)
  const week = Math.ceil(((thursday.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

// ── Subject-line stat pool (separate from the body's 7-stat pool above) ────
// Code picks 2-4 of these at random each run — not left to Claude's judgment
// like the body is — so the subject line varies week to week instead of
// converging on whatever Claude finds most "interesting." A stat is only
// ever in the pool if its value is non-zero/meaningful this range.
interface SubjectLineStat {
  key: 'deeds' | 'bingos' | 'top_deed' | 'active_players'
  promptPhrase: string
  fallbackFragment: string
}

async function computeSubjectLineStatPool(
  supabase: ReturnType<typeof getSupabase>,
  rangeStartIso: string,
  rangeEndIso: string | null,
): Promise<SubjectLineStat[]> {
  let deedsQuery = supabase
    .from('completed_deeds')
    .select('id, deed_id, player_id')
    .eq('is_hidden_from_impact_board', false)
    .gte('completed_at', rangeStartIso)
  if (rangeEndIso) deedsQuery = deedsQuery.lt('completed_at', rangeEndIso)
  const { data: rangeDeeds } = await deedsQuery
  const totalDeeds = rangeDeeds?.length ?? 0

  let bingoQuery = supabase
    .from('draw_entry_ledger')
    .select('id', { count: 'exact', head: true })
    .eq('reason', 'Bingo completed — bonus entries')
    .gte('created_at', rangeStartIso)
  if (rangeEndIso) bingoQuery = bingoQuery.lt('created_at', rangeEndIso)
  const { count: bingoCount } = await bingoQuery
  const totalBingos = bingoCount ?? 0

  const activePlayers = new Set((rangeDeeds ?? []).map((d) => d.player_id).filter(Boolean)).size

  let topDeedText: string | null = null
  if (rangeDeeds && rangeDeeds.length > 0) {
    const counts = new Map<number, number>()
    for (const d of rangeDeeds) {
      if (d.deed_id == null) continue
      counts.set(d.deed_id, (counts.get(d.deed_id) ?? 0) + 1)
    }
    let best = 0
    let bestId: number | null = null
    for (const [id, n] of counts) { if (n > best) { best = n; bestId = id } }
    if (bestId != null) {
      const { data: deedRow } = await supabase.from('good_deeds').select('deed_text').eq('id', bestId).maybeSingle()
      topDeedText = deedRow?.deed_text ?? null
    }
  }

  const pool: SubjectLineStat[] = []
  if (totalDeeds > 0) {
    pool.push({
      key: 'deeds',
      promptPhrase: `${totalDeeds} Gr8Day Deeds were completed by the community this week`,
      fallbackFragment: `${totalDeeds} deed${totalDeeds === 1 ? '' : 's'}`,
    })
  }
  if (totalBingos > 0) {
    pool.push({
      key: 'bingos',
      promptPhrase: `${totalBingos} bingo${totalBingos === 1 ? '' : 's'} were completed this week`,
      fallbackFragment: `${totalBingos} bingo${totalBingos === 1 ? '' : 's'}`,
    })
  }
  if (topDeedText) {
    pool.push({
      key: 'top_deed',
      promptPhrase: `the most popular deed this week was "${topDeedText}"`,
      fallbackFragment: `"${topDeedText}" was the top deed`,
    })
  }
  if (activePlayers > 0) {
    pool.push({
      key: 'active_players',
      promptPhrase: `${activePlayers} active player${activePlayers === 1 ? '' : 's'} took part this week`,
      fallbackFragment: `${activePlayers} active player${activePlayers === 1 ? '' : 's'}`,
    })
  }
  return pool
}

/** Randomly select 2-4 stats from the pool (Fisher-Yates shuffle, then take
 *  a random count in [2,4]). Falls back to whatever's available — even a
 *  single stat, or none — when the pool is smaller than 2. Cosmetic variety
 *  only, not security-sensitive, so Math.random() is fine here. */
function pickRandomStats(pool: SubjectLineStat[]): SubjectLineStat[] {
  if (pool.length <= 2) return pool
  const shuffled = [...pool]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const count = Math.min(shuffled.length, 2 + Math.floor(Math.random() * 3)) // 2, 3, or 4
  return shuffled.slice(0, count)
}

function fallbackSubjectLine(selected: SubjectLineStat[]): string {
  if (selected.length === 0) return 'Your HavaGr8Day weekly update'
  return `${selected.map((s) => s.fallbackFragment).join(', ')} this week!`
}

/** Generate the subject line from the selected stats. Always resolves —
 *  never throws — so a slow/failed/malformed Anthropic call falls back to a
 *  static template built from the same selected stats rather than blocking
 *  the send. Char-limit/quote validation is specific to this call site and
 *  lives here; the network call, 5s timeout, and thinking-disabled behavior
 *  are shared — see callAnthropicForText. */
async function generateSubjectLine(
  anthropicKey: string,
  selected: SubjectLineStat[],
): Promise<{ subject: string; source: 'ai' | 'fallback'; fallback_reason?: string }> {
  if (selected.length === 0) {
    return { subject: fallbackSubjectLine(selected), source: 'fallback', fallback_reason: 'no_stats_available' }
  }

  const statLines = selected.map((s) => `- ${s.promptPhrase}`).join('\n')
  const prompt = `Write ONE short, warm, on-brand subject line for the Havagr8day Bingo weekly member update email.

Weave these real numbers in naturally — don't just list them:
${statLines}

Rules: under 60 characters. No quotation marks. No generic filler like "Check out this week's update!". Respond with ONLY the subject line text, nothing else — no quotes, no markdown, no preamble.`

  const result = await callAnthropicForText(anthropicKey, { prompt, maxTokens: 300 })
  if (!result.ok) {
    console.error('[weekly-member-update] subject-line call failed:', result.reason)
    return { subject: fallbackSubjectLine(selected), source: 'fallback', fallback_reason: result.reason }
  }
  // Models often wrap their whole answer in quotes even when told not to
  // ("Like this!" instead of Like this!) — strip one such wrapping pair
  // before validating. Only double quotes count as "quotation marks" here
  // — apostrophes ('week's', 'let's', 'we're') are normal contractions in
  // a warm sentence and must not trip this check, or virtually every
  // response fails validation regardless of content.
  const raw = result.text.replace(/^["“”](.*)["“”]$/, '$1').trim()
  if (!raw || raw.length > 60 || /["“”]/.test(raw)) {
    console.error('[weekly-member-update] subject-line output failed validation:', raw ? 'invalid' : 'empty')
    return { subject: fallbackSubjectLine(selected), source: 'fallback', fallback_reason: 'failed_validation' }
  }
  return { subject: raw, source: 'ai' }
}

async function alertAdmins(supabase: ReturnType<typeof getSupabase>, reason: string): Promise<void> {
  try {
    const { data: recipients } = await supabase
      .from('admin_alert_recipients').select('email').eq('is_active', true)
    if (recipients && recipients.length > 0) {
      const tpl = weeklyUpdateFailedAlertEmail(reason)
      await Promise.all(recipients.map((r) => sendEmail({ to: r.email, subject: tpl.subject, html: tpl.html })))
    }
  } catch (err) {
    console.error('[weekly-member-update] failed to alert admins', err)
  }
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  // Allow GET for cron invocation, POST for manual trigger — same as weekly-reset.
  if (req.method !== 'GET' && req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret) {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (authHeader !== `Bearer ${cronSecret}`) {
      return errorResponse('Unauthorized', 401)
    }
  }

  const supabase = getSupabase()
  const url = new URL(req.url)

  try {
    // ── Dry run: subject-line generation only, against last week's real,
    // fully-completed numbers. Runs the stat-pool + selection + Claude call
    // N times (5-10, default 8) so Curt can review both output quality and
    // that stat selection is actually varying. Never touches recipients,
    // never sends anything, never writes weekly_update_log/last_sent_at.
    if (url.searchParams.get('dry_run') === 'true') {
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
      if (!anthropicKey) {
        return jsonResponse({ dry_run: true, error: 'ANTHROPIC_API_KEY not configured' })
      }
      const countParam = parseInt(url.searchParams.get('count') ?? '8')
      const runs = Number.isFinite(countParam) ? Math.min(Math.max(countParam, 5), 10) : 8

      const weekStart = getCurrentWeekStart()
      const weekStartIso = weekStart.toISOString()
      const lastWeekStartIso = new Date(weekStart.getTime() - 7 * 86_400_000).toISOString()

      const pool = await computeSubjectLineStatPool(supabase, lastWeekStartIso, weekStartIso)
      const results = []
      for (let i = 0; i < runs; i++) {
        const selected = pickRandomStats(pool)
        const { subject, source, fallback_reason } = await generateSubjectLine(anthropicKey, selected)
        results.push({
          run: i + 1,
          selected_stats: selected.map((s) => s.key),
          subject,
          source,
          fallback_reason: fallback_reason ?? null,
        })
      }
      return jsonResponse({
        dry_run: true,
        week_of: lastWeekStartIso.slice(0, 10),
        stat_pool_available: pool.map((s) => s.key),
        results,
      })
    }

    // ── How much of the active base gets emailed this run, and the prompt ──
    const { data: cfgRows } = await supabase
      .from('game_configs').select('config_key, config_value')
      .in('config_key', ['weekly_update_percentage', 'weekly_update_prompt'])
    const cfg: Record<string, string> = {}
    for (const r of cfgRows ?? []) cfg[r.config_key] = r.config_value ?? ''

    const pct = Math.max(0, Math.min(100, parseInt(cfg['weekly_update_percentage'] ?? '0', 10) || 0))
    if (pct <= 0) {
      return jsonResponse({ success: true, sent: 0, skipped_reason: 'weekly_update_percentage is 0 or unset' })
    }

    // ── Select active members, least-recently-contacted first ──────────────
    // "Active" mirrors the 4-week inactivity policy already enforced for the
    // weekly game-launch email (sendGameLaunchEmails in game/index.ts) — out
    // of respect for a player's inbox once they've stopped playing.
    const { data: allUsers, error: usersErr } = await supabase
      .from('users')
      .select('id, email, first_name, name, username, last_valid_deed_date, created_at, last_sent_at')
      .eq('email_verified', true)
      .eq('role', 'user')
    if (usersErr) throw usersErr

    const fourWeeksAgo = new Date(Date.now() - 28 * 86_400_000).toISOString()
    const active = (allUsers ?? []).filter((u) => {
      const ref = u.last_valid_deed_date ?? u.created_at
      return !ref || ref >= fourWeeksAgo
    })
    active.sort((a, b) => {
      if (!a.last_sent_at && !b.last_sent_at) return 0
      if (!a.last_sent_at) return -1
      if (!b.last_sent_at) return 1
      return a.last_sent_at < b.last_sent_at ? -1 : 1
    })

    const recipients = active.slice(0, Math.ceil(active.length * (pct / 100)))
    if (recipients.length === 0) {
      return jsonResponse({ success: true, sent: 0, skipped_reason: 'no eligible active members' })
    }

    // ── Gather this week's content inputs, once for the whole run ──────────
    const weekStart = getCurrentWeekStart()
    const weekStartIso = weekStart.toISOString()
    const weekOf = toDateOnly(weekStart)
    const lastWeekStart = new Date(weekStart.getTime() - 7 * 86_400_000)
    const lastWeekStartIso = lastWeekStart.toISOString()
    const { data: weekDeeds } = await supabase
      .from('completed_deeds')
      .select('id, category, country_name, city')
      .eq('is_hidden_from_impact_board', false)
      .gte('completed_at', weekStartIso)

    const totalDeedsThisWeek = weekDeeds?.length ?? 0
    const countriesThisWeek = new Set((weekDeeds ?? []).map((d) => d.country_name).filter(Boolean)).size
    const citiesThisWeek = new Set((weekDeeds ?? []).map((d) => d.city).filter(Boolean)).size

    let topCategory: string | null = null
    if (weekDeeds && weekDeeds.length > 0) {
      const counts = new Map<string, number>()
      for (const d of weekDeeds) {
        if (!d.category) continue
        counts.set(d.category, (counts.get(d.category) ?? 0) + 1)
      }
      let best = 0
      for (const [cat, n] of counts) {
        if (n > best) { best = n; topCategory = cat }
      }
    }

    // Week-over-week % change in community deed volume.
    const { count: lastWeekDeedsCount } = await supabase
      .from('completed_deeds')
      .select('id', { count: 'exact', head: true })
      .eq('is_hidden_from_impact_board', false)
      .gte('completed_at', lastWeekStartIso)
      .lt('completed_at', weekStartIso)
    const lastWeekDeeds = lastWeekDeedsCount ?? 0
    const wowPctChange = lastWeekDeeds > 0
      ? Math.round(((totalDeedsThisWeek - lastWeekDeeds) / lastWeekDeeds) * 100)
      : null

    // New players who joined this week.
    const { count: newPlayersCount } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', weekStartIso)
    const newPlayersThisWeek = newPlayersCount ?? 0

    // Bingos achieved this week — one draw_entry_ledger row per newly-
    // completed line, same ledger awardNewBingoLines writes to in game/index.ts.
    const { count: bingosCount } = await supabase
      .from('draw_entry_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('reason', 'Bingo completed — bonus entries')
      .gte('created_at', weekStartIso)
    const bingosThisWeek = bingosCount ?? 0

    // Deed of the Week — the current admin spotlight deed, only if it's
    // still stamped for the current week (same expiry rule the Quick Tap
    // badge itself uses — see admin_spotlight_quick_tap's migration).
    let spotlightDeedText: string | null = null
    const { data: spotlight } = await supabase
      .from('admin_spotlight_quick_tap').select('deed_id, week_year').eq('id', 1).maybeSingle()
    if (spotlight?.deed_id && spotlight.week_year === getCurrentWeekYear()) {
      const { data: deedRow } = await supabase
        .from('good_deeds').select('deed_text').eq('id', spotlight.deed_id).maybeSingle()
      spotlightDeedText = deedRow?.deed_text ?? null
    }

    // ── One Claude API call for the week's template ────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      await alertAdmins(supabase, 'ANTHROPIC_API_KEY is not set — weekly member update skipped.')
      return jsonResponse({ success: false, sent: 0, skipped_reason: 'ANTHROPIC_API_KEY not configured' })
    }

    const statsLines = [
      `Total Gr8Day Deeds completed by the whole community this week: ${totalDeedsThisWeek}`,
      `New players who joined this week: ${newPlayersThisWeek}`,
      `Countries with at least one deed this week: ${countriesThisWeek}`,
      `Cities with at least one deed this week: ${citiesThisWeek}`,
      `Bingos (completed lines) achieved this week: ${bingosThisWeek}`,
      topCategory ? `Most popular deed category this week: ${topCategory}` : null,
      wowPctChange !== null ? `Community deeds ${wowPctChange >= 0 ? 'up' : 'down'} ${Math.abs(wowPctChange)}% vs last week (last week: ${lastWeekDeeds}, this week: ${totalDeedsThisWeek})` : null,
    ].filter(Boolean).join('\n')

    const styleGuidance = cfg['weekly_update_prompt']?.trim() || DEFAULT_STYLE_GUIDANCE
    const prompt = FIXED_BASE_PROMPT
      .replaceAll('{{STATS}}', statsLines)
      .replaceAll('{{SPOTLIGHT_DEED}}', spotlightDeedText ?? 'none set this week')
      + `\n\nStyle guidance: ${styleGuidance}`

    // maxTokens 600 is the largest of the four call sites sharing this
    // helper (see _shared/anthropic.ts), so it gets a longer timeout than
    // the 5s default sized for short copy — this call previously had no
    // timeout at all.
    const bodyResult = await callAnthropicForText(anthropicKey, { prompt, maxTokens: 600, timeoutMs: 15000 })

    if (!bodyResult.ok) {
      await alertAdmins(supabase, `Claude API call failed (${bodyResult.reason})`)
      return jsonResponse({ success: false, sent: 0, skipped_reason: 'Claude API call failed' })
    }

    let parsed: { subject?: string; body?: string } = {}
    try {
      const match = bodyResult.text.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(match ? match[0] : bodyResult.text)
    } catch {
      // leave parsed empty — handled by the validation check below
    }

    if (!parsed.subject?.trim() || !parsed.body?.trim() || !parsed.body.includes('{{DEED_COUNT}}')) {
      await alertAdmins(supabase, 'Claude returned an unusable weekly update template (missing subject/body/{{DEED_COUNT}}). Send skipped.')
      return jsonResponse({ success: false, sent: 0, skipped_reason: 'Claude output failed validation' })
    }

    const bodyTemplate = parsed.body.trim()

    // ── Subject line: separate stat-pool-driven generation, replacing
    // whatever subject the combined call above produced. Falls back to a
    // static template on failure but never blocks the send — the body
    // generation above is what determines whether this week's update goes
    // out at all; the subject line just varies which stats it highlights.
    const subjectStatPool = await computeSubjectLineStatPool(supabase, weekStartIso, null)
    const selectedSubjectStats = pickRandomStats(subjectStatPool)
    const subjectResult = await generateSubjectLine(anthropicKey, selectedSubjectStats)
    const subject = subjectResult.subject
    if (subjectResult.source === 'fallback') {
      console.error('[weekly-member-update] subject line used fallback template, reason:', subjectResult.fallback_reason)
    }

    // ── Merge + send per recipient ──────────────────────────────────────────
    let sent = 0
    let failed = 0
    for (const player of recipients) {
      try {
        const { count } = await supabase
          .from('completed_deeds')
          .select('id', { count: 'exact', head: true })
          .eq('player_id', player.id)
          .eq('is_hidden_from_impact_board', false)
          .gte('completed_at', weekStartIso)

        const personalBody = bodyTemplate.replaceAll('{{DEED_COUNT}}', String(count ?? 0))
        const displayName = player.first_name ?? player.name ?? player.username ?? null
        const tpl = weeklyMemberUpdateEmail(displayName, subject, personalBody)
        const result = await sendEmail({ to: player.email, subject: tpl.subject, html: tpl.html })

        if (result.sent) {
          sent++
          const nowIso = new Date().toISOString()
          await supabase.from('users').update({ last_sent_at: nowIso }).eq('id', player.id)
          await supabase.from('weekly_update_log').insert({
            player_id: player.id,
            sent_at: nowIso,
            week_of: weekOf,
            message_snapshot: `Subject: ${subject}\n\n${personalBody}`,
          })
        } else {
          failed++
        }
      } catch (err) {
        failed++
        console.error('[weekly-member-update] send failed for', player.email, err)
      }
    }

    return jsonResponse({
      success: true,
      sent,
      failed,
      eligible_active: active.length,
      recipients: recipients.length,
      week_of: weekOf,
      subject_source: subjectResult.source,
      subject_stats_used: selectedSubjectStats.map((s) => s.key),
    })
  } catch (err) {
    console.error('weekly-member-update error:', err)
    return errorResponse('Internal server error', 500)
  }
})
