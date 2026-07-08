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
  scheduledAt?: string
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
        ...(opts.scheduledAt ? { scheduled_at: opts.scheduledAt } : {}),
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

export function gameAnnouncementEmail(opts: {
  name: string | null
  prize: string
  gameType: string
  theme: string
  extraMessage?: string
}): { subject: string; html: string } {
  const hi = opts.name && opts.name.trim() ? opts.name.trim() : 'there'
  const themeLine = opts.theme ? `<p><strong>🎨 Theme:</strong> ${opts.theme}</p>` : ''
  const extraLine = opts.extraMessage ? `<p style="margin-top:12px">${opts.extraMessage}</p>` : ''
  return {
    subject: `🎯 A new Havagr8day Bingo game has started!`,
    html: layout(`
      <h2 style="margin:0 0 12px;color:#4F46E5;font-size:20px">A new game has started, ${hi}!</h2>
      <p>Here's what you need to know about this week's game:</p>
      <div style="background:#f8fafc;border-radius:10px;padding:16px 20px;margin:16px 0;border-left:4px solid #4FB3E8">
        <p style="margin:0 0 8px"><strong>🏆 Prize:</strong> ${opts.prize}</p>
        <p style="margin:0 0 8px"><strong>🎮 Game Type:</strong> ${opts.gameType}</p>
        ${themeLine}
      </div>
      ${extraLine}
      <p style="text-align:center;margin:24px 0">
        <a href="${SITE_URL}/game" style="display:inline-block;background:#DC2626;color:#fff;font-weight:bold;padding:13px 30px;border-radius:10px;text-decoration:none;border:2px solid #FCD34D">Play Now</a>
      </p>
      <div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:16px">
        <p style="margin:0 0 10px;font-weight:bold;color:#1e293b">Quick Guide to Game Panel Buttons:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr style="background:#f1f5f9">
            <td style="padding:8px 10px;border-radius:6px 0 0 6px;font-weight:bold;color:#4F46E5">Pick Three</td>
            <td style="padding:8px 10px;border-radius:0 6px 6px 0;color:#475569">Once per game, instantly swap 3 unplayed squares for 3 new challenges — free.</td>
          </tr>
          <tr>
            <td style="padding:8px 10px;font-weight:bold;color:#DC2626">💣 Bomb Button<br/><span style="font-size:12px;color:#94a3b8">(Hidden Square)</span></td>
            <td style="padding:8px 10px;color:#475569">A surprise hidden square — could be good or bad. Tap to reveal!</td>
          </tr>
          <tr style="background:#f1f5f9">
            <td style="padding:8px 10px;font-weight:bold;color:#7C3AED">I Bet Ya<br/><span style="font-size:12px;color:#94a3b8">(Centre Square)</span></td>
            <td style="padding:8px 10px;color:#475569">Spin the centre square for a random challenge or reward.</td>
          </tr>
          <tr>
            <td style="padding:8px 10px;font-weight:bold;color:#059669">👛 Watch Your Wallet<br/><span style="font-size:12px;color:#94a3b8">(Hidden Square)</span></td>
            <td style="padding:8px 10px;color:#475569">Another hidden square that adds or takes away a few dollars from your wallet.</td>
          </tr>
        </table>
      </div>
      <p style="color:#64748b;font-size:13px;margin-top:20px">Have a gr8 day — and make someone else's gr8 too.</p>
    `),
  }
}

export function newGameLaunchEmail(firstName: string | null): { subject: string; html: string } {
  const hi = firstName && firstName.trim() ? firstName.trim() : 'there'
  return {
    subject: 'A new game just started!',
    html: layout(`
      <h2 style="margin:0 0 12px;color:#4F46E5;font-size:20px">Hey ${hi},</h2>
      <p>I am letting you know we just launched a new game so go check it out.</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${SITE_URL}/game" style="display:inline-block;background:#DC2626;color:#fff;font-weight:bold;padding:13px 30px;border-radius:10px;text-decoration:none;border:2px solid #FCD34D">Play Now</a>
      </p>
      <p>Have a great (gr8) day</p>
      <p style="margin-top:20px">
        <strong>Curt Skene</strong><br/>
        <span style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Founder</span>
      </p>
    `),
  }
}

export function verifyEmailEmail(verifyUrl: string): { subject: string; html: string } {
  return {
    subject: 'Verify your Havagr8day Bingo email address',
    html: layout(`
      <h2 style="margin:0 0 12px;color:#4F46E5;font-size:20px">Confirm your email</h2>
      <p>Thanks for signing up! Click the button below to verify your email address and start playing.</p>
      <p>This link expires in <strong>24 hours</strong>.</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${verifyUrl}" style="display:inline-block;background:#DC2626;color:#fff;font-weight:bold;padding:13px 30px;border-radius:10px;text-decoration:none;border:2px solid #FCD34D">Verify My Email</a>
      </p>
      <p style="color:#64748b;font-size:13px">If you didn't create this account, you can safely ignore this email.</p>
    `),
  }
}

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

export function adminLockoutEmail(unlockUrl: string): { subject: string; html: string } {
  return {
    subject: 'Havagr8day Bingo — Admin login locked',
    html: layout(`
      <h2 style="margin:0 0 12px;color:#4F46E5;font-size:20px">Admin login locked</h2>
      <p>5 failed admin login attempts were detected on Havagr8day Bingo.</p>
      <p>Admin login is now locked as a precaution. If this was you, click below to unlock it:</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${unlockUrl}" style="display:inline-block;background:#DC2626;color:#fff;font-weight:bold;padding:13px 30px;border-radius:10px;text-decoration:none;border:2px solid #FCD34D">Unlock Admin Login</a>
      </p>
      <p style="color:#64748b;font-size:13px">This link expires in 24 hours. If this wasn't you, no action is needed — the lock stays in place until unlocked.</p>
    `),
  }
}

export function adminPasswordResetEmail(resetUrl: string): { subject: string; html: string } {
  return {
    subject: 'Havagr8day Bingo — Admin password reset',
    html: layout(`
      <h2 style="margin:0 0 12px;color:#4F46E5;font-size:20px">Reset admin password</h2>
      <p>A password reset was requested for the Havagr8day Bingo admin panel.</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${resetUrl}" style="display:inline-block;background:#DC2626;color:#fff;font-weight:bold;padding:13px 30px;border-radius:10px;text-decoration:none;border:2px solid #FCD34D">Reset Admin Password</a>
      </p>
      <p style="color:#64748b;font-size:13px">This link expires in 1 hour. If you didn't request this, ignore this email — your password stays unchanged.</p>
    `),
  }
}

export function referralJoinedEmail(friendName: string | null): { subject: string; html: string } {
  const friend = friendName && friendName.trim() ? friendName.trim() : 'Someone you invited'
  return {
    subject: 'Your friend joined Havagr8day Bingo! 🎉',
    html: layout(`
      <h2 style="margin:0 0 12px;color:#4F46E5;font-size:20px">Your referral counted!</h2>
      <p><strong>${friend}</strong> just created an account using your invite.</p>
      <p>Your "Refer a Player" square is now unlocked. Open your card to see it marked.</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${SITE_URL}/game" style="display:inline-block;background:#10B981;color:#fff;font-weight:bold;padding:13px 30px;border-radius:10px;text-decoration:none">Go to My Card</a>
      </p>
      <p style="color:#64748b;font-size:13px">Thank you for helping the community grow.</p>
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

export function welcomeEmail(name: string | null): { subject: string; html: string } {
  const hi = name && name.trim() ? name.trim() : 'there'
  return {
    subject: 'Welcome to Havagr8day Bingo! 🎉',
    html: layout(`
      <h2 style="margin:0 0 12px;color:#4F46E5;font-size:20px">Welcome, ${hi}!</h2>
      <p>Your account is ready. Havagr8day Bingo is all about doing real acts of kindness to mark squares on your card and win prizes.</p>
      <p>A fresh card is generated every Monday. Complete deeds, mark your squares, refer a friend to unlock the centre square, and aim for Bingo!</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${SITE_URL}/game" style="display:inline-block;background:#DC2626;color:#fff;font-weight:bold;padding:13px 30px;border-radius:10px;text-decoration:none;border:2px solid #FCD34D">Play Now</a>
      </p>
      <p style="color:#64748b;font-size:13px">Thanks for joining the community. Have a gr8 day!</p>
    `),
  }
}

export function bingoWinEmail(name: string | null, winConditionLabel?: string | null): { subject: string; html: string } {
  const hi = name && name.trim() ? name.trim() : 'Champion'
  const cond = winConditionLabel && winConditionLabel.trim() ? ` (${winConditionLabel.trim()})` : ''
  return {
    subject: 'BINGO! You completed your Havagr8day card 🏆',
    html: layout(`
      <h2 style="margin:0 0 12px;color:#10B981;font-size:22px">BINGO, ${hi}! 🏆</h2>
      <p>You completed your card${cond}. Every square you marked was a real act of kindness, well done!</p>
      <p>Open your card to claim your prize and start spreading more kindness.</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${SITE_URL}/game" style="display:inline-block;background:#10B981;color:#fff;font-weight:bold;padding:13px 30px;border-radius:10px;text-decoration:none">View My Card</a>
      </p>
      <p style="color:#64748b;font-size:13px">Keep being gr8.</p>
    `),
  }
}

export function newPlayerNotificationEmail(firstName: string, lastName: string, email: string): { subject: string; html: string } {
  return {
    subject: `New player signed up: ${firstName} ${lastName}`,
    html: layout(`
      <h2 style="margin:0 0 12px;color:#4F46E5;font-size:20px">New player just registered!</h2>
      <p><strong>Name:</strong> ${firstName} ${lastName}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p style="color:#64748b;font-size:13px">This is an automatic notification from Havagr8day Bingo.</p>
    `),
  }
}

export function prizeClaimConfirmationEmail(name: string | null): { subject: string; html: string } {
  const hi = name && name.trim() ? name.trim() : 'there'
  return {
    subject: 'We received your Havagr8day prize claim',
    html: layout(`
      <h2 style="margin:0 0 12px;color:#4F46E5;font-size:20px">Claim received, ${hi}!</h2>
      <p>Thanks for submitting your prize claim. Our team will review it and contact you within 48 hours to arrange your reward.</p>
      <p>If you have any questions in the meantime, just reply to this email.</p>
      <p style="color:#64748b;font-size:13px">Congratulations again, and thank you for playing.</p>
    `),
  }
}

// Letter Two — Curt's "A Quick Note About Winning". Sent ~24-48 hours after
// sign-up (scheduled via Resend's scheduled_at at registration time).
export function secondLetterEmail(_name: string | null): { subject: string; html: string } {
  return {
    subject: 'A Quick Note About Winning',
    html: layout(`
      <h2 style="margin:0 0 16px;color:#4F46E5;font-size:22px">A Quick Note About Winning</h2>

      <p>If you've spent any time around me, you know I enjoy winning.</p>

      <p>But I want to be very clear about something.</p>

      <p>The number one purpose of HavaGr8Day Bingo is not to win prizes, fill cards, or climb leaderboards.</p>

      <p style="font-weight:bold;color:#1e293b">The number one purpose of HavaGr8Day Bingo is to promote kindness through fun play.</p>

      <p>The game exists to help us pay attention to the world around us and encourage us to do small things that make a big difference in the lives of others. The points, badges, prizes, and bingo cards are simply tools to make the experience more engaging.</p>

      <p>Never let your desire to succeed overshadow the purpose of the game.</p>

      <p>Some weeks you'll look at your card and discover that several challenges happened naturally. You'll complete squares without even trying. Other weeks you'll find yourself one square short, wondering where the opportunities went.</p>

      <p>That's life.</p>

      <p>Some weeks life gives us countless chances to connect, encourage, appreciate, help, and delight others. Some weeks we're busy, distracted, travelling, dealing with challenges, or simply trying to keep our own heads above water.</p>

      <p>Both experiences are perfectly normal.</p>

      <p>This is not a race.</p>

      <p>This is not a test.</p>

      <p>This is certainly not a reason to feel guilty because you didn't complete every challenge on your card.</p>

      <p style="font-weight:bold;color:#1e293b">HavaGr8Day Bingo is meant to add joy to your life, not pressure.</p>

      <p>If a challenge inspires you to make someone's day, fantastic.</p>

      <p>If you complete a row, wonderful.</p>

      <p>If you fill an entire card, congratulations.</p>

      <p>But if all you accomplish this week is becoming a little more aware of the people around you, then you've already won.</p>

      <p style="font-weight:bold;color:#1e293b">The real prize has never been the prize.</p>

      <p>The real prize is becoming the kind of person who naturally looks for opportunities to make the world a little brighter.</p>

      <p>So play hard.</p>

      <p>Have fun.</p>

      <p>Celebrate your successes.</p>

      <p>Laugh when things don't go as planned.</p>

      <p>And remember that the greatest victories in this game are often the ones that never appear on a scoreboard.</p>

      <p>Thank you for being part of this growing community of people who believe that small acts of kindness can create big changes.</p>

      <p>Now go out there, enjoy the journey, and have a GR8 Day.</p>

      <p style="margin-top:20px">
        <span style="font-weight:bold;color:#1e293b">Curt Skene</span><br/>
        <span style="color:#64748b">Founder, HavaGr8Day Bingo</span>
      </p>
    `),
  }
}

// Letter Three — Curt's "A Few Fun Features You Should Know About". Sent 1-2
// days after Letter Two (scheduled ~48h after sign-up via Resend scheduled_at).
export function thirdLetterEmail(_name: string | null): { subject: string; html: string } {
  return {
    subject: 'A Few Fun Features You Should Know About',
    html: layout(`
      <h2 style="margin:0 0 16px;color:#4F46E5;font-size:22px">A Few Fun Features You Should Know About</h2>

      <p>One thing you'll quickly discover about HavaGr8Day Bingo is that we take kindness seriously.</p>

      <p>We don't take ourselves too seriously.</p>

      <p>While our mission is to encourage people to create great days for others, we also want the game itself to be fun, surprising, and filled with a few twists along the way.</p>

      <p>Here are three features you'll want to know about.</p>

      <h3 style="margin:20px 0 8px;color:#1e293b;font-size:18px">Pick Three</h3>

      <p>Let's face it.</p>

      <p>Sometimes life gets in the way.</p>

      <p>You may receive a challenge that simply doesn't fit your week, your schedule, your personality, or your circumstances.</p>

      <p>No problem.</p>

      <p>That's why we've included the Pick Three option.</p>

      <p>When you use it, we'll instantly replace three squares on your card with three brand-new challenges.</p>

      <p>Notice I said three.</p>

      <p>Not one.</p>

      <p>Not two.</p>

      <p>Three.</p>

      <p>The feature is called Pick Three for a reason.</p>

      <p>Use it wisely and you may discover three new opportunities to make someone's day great.</p>

      <h3 style="margin:20px 0 8px;color:#1e293b;font-size:18px">The Bomb Square</h3>

      <p>Now for the feature that tends to surprise people.</p>

      <p>Approximately one in every hundred cards contains a Bomb Square.</p>

      <p>If you happen to find one and decide to click it, your entire card is instantly rewritten.</p>

      <p>Every square.</p>

      <p>Every challenge.</p>

      <p>Everything.</p>

      <p>Why would we do that?</p>

      <p>Because life doesn't always go according to plan.</p>

      <p>Sometimes the best adventures begin when your plans are blown up and you're forced to start fresh.</p>

      <p>Don't worry. The new card will be every bit as playable as the old one.</p>

      <p>Just consider it an unexpected plot twist in your HavaGr8Day journey.</p>

      <h3 style="margin:20px 0 8px;color:#1e293b;font-size:18px">Bonus Squares</h3>

      <p>Every now and then, the HavaGr8Day team may drop a little surprise into your spending account.</p>

      <p>Think of it as a random act of kindness from us to you.</p>

      <p>These bonus credits can't be withdrawn, transferred, or spent on groceries.</p>

      <p>But they can be used within the game to purchase an extra square or two and add a little more fun to your card.</p>

      <p>After all, if we're asking you to make other people's days great, it only seems fair that we occasionally try to make yours a little better too.</p>

      <p>As HavaGr8Day Bingo continues to grow, you'll see new features, new surprises, and new ways to play.</p>

      <p>Our goal is simple.</p>

      <p>Create a game that's fun enough to keep you coming back and meaningful enough to make a difference in the world around you.</p>

      <p>Thank you for being part of the adventure.</p>

      <p>Now get out there, complete a few squares, make someone's day, and most importantly...</p>

      <p style="font-size:18px;font-weight:bold;color:#4FB3E8">Have a GR8 Day!</p>

      <p style="margin-top:20px">
        <span style="font-weight:bold;color:#1e293b">Curt Skene</span><br/>
        <span style="color:#64748b">Founder, HavaGr8Day Bingo</span>
      </p>
    `),
  }
}

