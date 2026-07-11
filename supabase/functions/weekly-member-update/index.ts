import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getSupabase } from '../_shared/db.ts'
import { sendEmail } from '../_shared/email.ts'
import { weeklyMemberUpdateEmail, weeklyUpdateFailedAlertEmail } from '../_shared/email.ts'

// Admin-editable via game_configs.weekly_update_prompt_template (Admin Panel
// → Weekly Member Update). {{STATS}} is always substituted with this week's
// computed stats block before the call; if a custom template omits it, the
// stats block is appended instead so a prompt edit can never silently drop
// the week's real numbers. {{DEED_COUNT}} is Claude's own output token,
// substituted per-recipient after the call — not touched here.
const DEFAULT_PROMPT_TEMPLATE = `You write a short, warm weekly email update for Havagr8day Bingo, a game where players complete real acts of kindness to mark bingo squares.

Facts you can draw from (pick 2-3 that make the most interesting, upbeat story — vary which ones you lead with and how you phrase them each time you're called, don't just list them mechanically):
{{STATS}}

Write for a player who already plays the game. Warm, genuine, a little playful, never corporate or salesy. 2-3 short paragraphs, plain text (no markdown, no HTML). Somewhere natural in the message, include the exact literal placeholder token {{DEED_COUNT}} as part of a sentence about the reader's own personal deed count this week (e.g. "You personally logged {{DEED_COUNT}} deeds this week" — but vary the wording each time).

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"subject": "short warm subject line, under 60 characters, varies each time", "body": "the email body as described above"}`

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

  try {
    // ── How much of the active base gets emailed this run, and the prompt ──
    const { data: cfgRows } = await supabase
      .from('game_configs').select('config_key, config_value')
      .in('config_key', ['weekly_update_percentage', 'weekly_update_prompt_template'])
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

    const { data: weekDeeds } = await supabase
      .from('completed_deeds')
      .select('id, category, country_name')
      .eq('is_hidden_from_impact_board', false)
      .gte('completed_at', weekStartIso)

    const totalDeedsThisWeek = weekDeeds?.length ?? 0
    const countriesThisWeek = new Set((weekDeeds ?? []).map((d) => d.country_name).filter(Boolean)).size

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
      `Countries with at least one deed this week: ${countriesThisWeek}`,
      topCategory ? `Most popular deed category this week: ${topCategory}` : null,
      spotlightDeedText ? `This week's featured "Deed of the Week": ${spotlightDeedText}` : null,
    ].filter(Boolean).join('\n')

    const promptTemplate = cfg['weekly_update_prompt_template']?.trim() || DEFAULT_PROMPT_TEMPLATE
    const prompt = promptTemplate.includes('{{STATS}}')
      ? promptTemplate.replaceAll('{{STATS}}', statsLines)
      : `${promptTemplate}\n\nFacts for this week:\n${statsLines}`

    const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!claudeResp.ok) {
      const errText = await claudeResp.text().catch(() => '')
      await alertAdmins(supabase, `Claude API call failed (status ${claudeResp.status}): ${errText.slice(0, 500)}`)
      return jsonResponse({ success: false, sent: 0, skipped_reason: 'Claude API call failed' })
    }

    const claudeJson = await claudeResp.json()
    const rawText: string = claudeJson?.content?.[0]?.text ?? ''
    let parsed: { subject?: string; body?: string } = {}
    try {
      const match = rawText.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(match ? match[0] : rawText)
    } catch {
      // leave parsed empty — handled by the validation check below
    }

    if (!parsed.subject?.trim() || !parsed.body?.trim() || !parsed.body.includes('{{DEED_COUNT}}')) {
      await alertAdmins(supabase, 'Claude returned an unusable weekly update template (missing subject/body/{{DEED_COUNT}}). Send skipped.')
      return jsonResponse({ success: false, sent: 0, skipped_reason: 'Claude output failed validation' })
    }

    const subject = parsed.subject.trim()
    const bodyTemplate = parsed.body.trim()

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
    })
  } catch (err) {
    console.error('weekly-member-update error:', err)
    return errorResponse('Internal server error', 500)
  }
})
