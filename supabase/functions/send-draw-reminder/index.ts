// =============================================================================
// Weekly Monday reminder to run the prize draw. Deliberately does nothing but
// send one email — the draw itself is now a manual, confirm-before-committing
// step in the admin panel (see game/routes/admin_draw_results.ts). This used
// to be a fully-automatic cron (weekly-reset) that picked AND committed a
// winner with no review; that's been disabled in favour of this reminder.
// =============================================================================
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { sendEmail } from '../_shared/email.ts'

const ADMIN_EMAIL = 'curt.skene@curtskene.com'
const SITE_URL = 'https://havagr8day.com'

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'GET' && req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  // Same Vault-secret gate as the other scheduled jobs (weekly-reset,
  // send-founder-notes, etc.) — see cron_secret in supabase/migrations.
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret) {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (authHeader !== `Bearer ${cronSecret}`) {
      return errorResponse('Unauthorized', 401)
    }
  }

  const result = await sendEmail({
    to: ADMIN_EMAIL,
    subject: '⏰ Time to run the weekly Gr8Day Bingo draw',
    html: `
    <div style="background:#f1f5f9;padding:24px 0;font-family:Arial,Helvetica,sans-serif">
      <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">
        <div style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:20px 24px;text-align:center">
          <span style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:0.5px">🎲 Draw Day</span>
        </div>
        <div style="padding:28px 24px;color:#1e293b;font-size:15px;line-height:1.6">
          <p>It's Monday — time to run this week's Gr8Day Bingo prize draw.</p>
          <p>In the admin panel's Weekly Draw Run section, tap <strong>Run Draw Now</strong> to see the computed winner, then <strong>Confirm &amp; Announce</strong> to finalize it and email everyone.</p>
          <p style="text-align:center;margin:24px 0">
            <a href="${SITE_URL}/admin" style="display:inline-block;background:#4F46E5;color:#fff;font-weight:bold;padding:13px 30px;border-radius:10px;text-decoration:none">Open Admin Panel</a>
          </p>
        </div>
      </div>
    </div>`,
  })

  return jsonResponse({ success: true, sent: result.sent })
})
