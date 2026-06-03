// Shared email engine for all Havagr8day Bingo emails (Resend).
//
// Sending is best-effort: if RESEND_API_KEY is not configured the functions
// no-op and return { sent: false } so the rest of the request still succeeds.
// The "from" address only needs the domain (havagr8day.com) verified in Resend;
// the mailbox itself does not need to be logged into.

const FROM = 'Havagr8day Bingo <info@havagr8day.com>'
const SITE_URL = 'https://havagr8day.com'

export interface SendResult {
  sent: boolean
  error?: string
}

/** Low-level send. Never throws — returns a result the caller can ignore. */
export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
  replyTo?: string
}): Promise<SendResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey || apiKey === 'FILL_IN_FROM_RESEND_DASHBOARD') {
    console.log('[email] RESEND_API_KEY not set — skipping send to', opts.to)
    return { sent: false, error: 'not_configured' }
  }
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    })
    if (!resp.ok) {
      const body = await resp.text()
      console.error('[email] Resend error', resp.status, body)
      return { sent: false, error: `resend_${resp.status}` }
    }
    return { sent: true }
  } catch (err) {
    console.error('[email] send failed', err)
    return { sent: false, error: 'exception' }
  }
}

/** Wrap body content in the shared branded layout. */
function layout(innerHtml: string): string {
  return `
  <div style="background:#f1f5f9;padding:24px 0;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">
      <div style="background:#4FB3E8;padding:20px 24px;text-align:center">
        <span style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:0.5px">Havagr8day Bingo</span>
      </div>
      <div style="padding:28px 24px;color:#1e293b;font-size:15px;line-height:1.6">
        ${innerHtml}
      </div>
      <div style="padding:16px 24px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;text-align:center">
        Spreading kindness one good deed at a time.<br/>
        <a href="${SITE_URL}" style="color:#6366F1;text-decoration:none">havagr8day.com</a>
      </div>
    </div>
  </div>`
}

// ── Templates ────────────────────────────────────────────────────────────────

export function passwordResetEmail(resetUrl: string): { subject: string; html: string } {
  return {
    subject: 'Reset your Havagr8day Bingo password',
    html: layout(`
      <h2 style="margin:0 0 12px;color:#4F46E5;font-size:20px">Reset your password</h2>
      <p>We received a request to reset your Havagr8day Bingo password.</p>
      <p>Click the button below to choose a new password. This link expires in 1 hour.</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${resetUrl}" style="display:inline-block;background:#DC2626;color:#fff;font-weight:bold;padding:13px 30px;border-radius:10px;text-decoration:none">Reset Password</a>
      </p>
      <p style="color:#64748b;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
    `),
  }
}

export function referralInviteEmail(referrerName: string | null): { subject: string; html: string } {
  const who = referrerName && referrerName.trim() ? referrerName.trim() : 'A friend'
  const playUrl = `${SITE_URL}/register`
  return {
    subject: `${who} invited you to play Havagr8day Bingo!`,
    html: layout(`
      <h2 style="margin:0 0 12px;color:#4F46E5;font-size:20px">You're invited! 🎉</h2>
      <p><strong>${who}</strong> thinks you'd love Havagr8day Bingo, a game where you complete real acts of kindness to mark squares on your card and win prizes.</p>
      <p>A new card is generated every Monday. Do good, mark your squares, and have a gr8 day.</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${playUrl}" style="display:inline-block;background:#DC2626;color:#fff;font-weight:bold;padding:13px 30px;border-radius:10px;text-decoration:none;border:2px solid #FCD34D">Join the Game</a>
      </p>
      <p style="color:#64748b;font-size:13px">If this isn't for you, no worries, you can ignore this email.</p>
    `),
  }
}
