import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getSupabase } from '../_shared/db.ts'
import { sendEmail } from '../_shared/email.ts'
import { runWeeklyDraw } from '../_shared/draw.ts'

const SITE_URL = 'https://havagr8day.com'

function drawWinnerEmail(name: string | null, weekLabel: string): { subject: string; html: string } {
  const hi = name && name.trim() ? name.trim() : 'there'
  return {
    subject: `🎉 You won the Havagr8day draw — ${weekLabel}!`,
    html: `
    <div style="background:#f1f5f9;padding:24px 0;font-family:Arial,Helvetica,sans-serif">
      <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">
        <div style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:20px 24px;text-align:center">
          <span style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:0.5px">🏆 You're a Winner!</span>
        </div>
        <div style="padding:28px 24px;color:#1e293b;font-size:15px;line-height:1.6">
          <h2 style="margin:0 0 12px;color:#4F46E5;font-size:20px">Congratulations, ${hi}!</h2>
          <p>Your kindness paid off — you've been selected as this week's Havagr8day Bingo draw winner!</p>
          <p>The Havagr8day team will be in touch about your prize. Keep doing good things out there!</p>
          <p style="text-align:center;margin:24px 0">
            <a href="${SITE_URL}/game" style="display:inline-block;background:#DC2626;color:#fff;font-weight:bold;padding:13px 30px;border-radius:10px;text-decoration:none;border:2px solid #FCD34D">Play Again This Week</a>
          </p>
          <p style="color:#64748b;font-size:13px">Have a gr8 day — and make someone else's gr8 too.</p>
        </div>
        <div style="padding:16px 24px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;text-align:center">
          Spreading kindness one good deed at a time.<br/>
          <a href="${SITE_URL}" style="color:#6366F1;text-decoration:none">havagr8day.com</a>
        </div>
      </div>
    </div>`,
  }
}

function getCurrentWeekLabel(): string {
  const now = new Date()
  const jan4 = new Date(now.getFullYear(), 0, 4)
  const startOfWeek1 = new Date(jan4)
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7))
  const diff = now.getTime() - startOfWeek1.getTime()
  const week = Math.ceil((diff / 86400000 + 1) / 7)
  return `Week ${week}, ${now.getFullYear()}`
}

function getPreviousWeekYear(): string {
  // Returns the week_year string (YYYY-Www) for the week that just ended
  const now = new Date()
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const jan4 = new Date(lastWeek.getFullYear(), 0, 4)
  const startOfWeek1 = new Date(jan4)
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7))
  const diff = lastWeek.getTime() - startOfWeek1.getTime()
  const week = Math.ceil((diff / 86400000 + 1) / 7)
  return `${lastWeek.getFullYear()}-W${String(week).padStart(2, '0')}`
}

// Run the weekly draw for the week that just ended, then shape the result for
// the notification emails below. The heavy lifting (eligibility, weighting,
// winner reset, audit, inactivity expiry) lives in _shared/draw.ts so the same
// logic is shared with the admin "run draw" endpoint.
async function runWeeklyDrawForReset(
  supabase: ReturnType<typeof import('../_shared/db.ts').getSupabase>,
): Promise<{
  winner_id: string | null
  winner_name: string | null
  winner_email: string | null
  entries: number
  week_year: string
  already_ran: boolean
}> {
  const weekYear = getPreviousWeekYear()
  const r = await runWeeklyDraw(supabase, weekYear)
  return {
    winner_id: r.winner_id,
    winner_name: r.winner_name,
    winner_email: r.winner_email,
    entries: r.pool_entries,
    week_year: r.week_year,
    already_ran: r.already_ran,
  }
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  // Allow GET for cron invocation, POST for manual trigger
  if (req.method !== 'GET' && req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  // Verify the cron secret to prevent unauthorized triggers
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret) {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (authHeader !== `Bearer ${cronSecret}`) {
      return errorResponse('Unauthorized', 401)
    }
  }

  const supabase = getSupabase()

  try {
    // ── Run weekly draw ───────────────────────────────────────────────────────
    const draw = await runWeeklyDrawForReset(supabase)

    // Notify draw winner by email (best-effort)
    if (draw.winner_email && !draw.already_ran) {
      const weekLabel = getCurrentWeekLabel().replace('Week', 'the week of')
      const tpl = drawWinnerEmail(draw.winner_name, weekLabel)
      await sendEmail({ to: draw.winner_email, subject: tpl.subject, html: tpl.html })
    }

    // The bulk "new card is ready" email lived here until it was replaced by
    // sendGameLaunchEmails (game/index.ts) — the per-player-triggered,
    // AI-personalized version guarded by game_launch_notifications. Keeping
    // both sent every active player two emails at week rollover; this
    // endpoint's job now is just the weekly draw + winner notification above.
    const weekLabel = getCurrentWeekLabel()

    return jsonResponse({
      success: true,
      week: weekLabel,
      draw: {
        week_year: draw.week_year,
        entries: draw.entries,
        winner_id: draw.winner_id,
        winner_name: draw.winner_name,
        already_ran: draw.already_ran,
      },
    })
  } catch (err) {
    console.error('weekly-reset error:', err)
    return errorResponse('Internal server error', 500)
  }
})
