import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getSupabase } from '../_shared/db.ts'
import { sendEmail } from '../_shared/email.ts'

const SITE_URL = 'https://havagr8day.com'

function newWeekEmail(name: string | null, weekLabel: string): { subject: string; html: string } {
  const hi = name && name.trim() ? name.trim() : 'there'
  return {
    subject: `🎯 Your new Havagr8day Bingo card is ready — ${weekLabel}`,
    html: `
    <div style="background:#f1f5f9;padding:24px 0;font-family:Arial,Helvetica,sans-serif">
      <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">
        <div style="background:#4FB3E8;padding:20px 24px;text-align:center">
          <span style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:0.5px">Havagr8day Bingo</span>
        </div>
        <div style="padding:28px 24px;color:#1e293b;font-size:15px;line-height:1.6">
          <h2 style="margin:0 0 12px;color:#4F46E5;font-size:20px">New week, new card, ${hi}!</h2>
          <p>A fresh bingo card is waiting for you. Complete acts of kindness to mark your squares and go for Bingo!</p>
          <p style="text-align:center;margin:24px 0">
            <a href="${SITE_URL}/game" style="display:inline-block;background:#DC2626;color:#fff;font-weight:bold;padding:13px 30px;border-radius:10px;text-decoration:none;border:2px solid #FCD34D">Play This Week</a>
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
    // Fetch all verified, active players
    const { data: players, error } = await supabase
      .from('users')
      .select('email, first_name, name, username')
      .eq('email_verified', true)
      .eq('role', 'user')

    if (error) throw error
    if (!players || players.length === 0) {
      return jsonResponse({ success: true, sent: 0, message: 'No players to notify.' })
    }

    const weekLabel = getCurrentWeekLabel()
    let sent = 0
    let failed = 0

    for (const player of players) {
      const displayName = player.first_name ?? player.name ?? player.username ?? null
      const tpl = newWeekEmail(displayName, weekLabel)
      const result = await sendEmail({ to: player.email, subject: tpl.subject, html: tpl.html })
      if (result.sent) sent++
      else failed++
    }

    return jsonResponse({ success: true, sent, failed, week: weekLabel })
  } catch (err) {
    console.error('weekly-reset error:', err)
    return errorResponse('Internal server error', 500)
  }
})
