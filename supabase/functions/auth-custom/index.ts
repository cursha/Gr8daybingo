import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createAccessToken, getAuthUser, requireAuth } from '../_shared/auth.ts'
import { getSupabase, getSubPath } from '../_shared/db.ts'
import { sendEmail, referralJoinedEmail, welcomeEmail, verifyEmailEmail, newPlayerNotificationEmail, secondLetterEmail, thirdLetterEmail } from '../_shared/email.ts'
import bcrypt from 'npm:bcryptjs@2'

const ADMIN_EMAIL = 'curt.skene@curtskene.com'
const SITE_URL = 'https://havagr8day.com'

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  const url = new URL(req.url)
  const rawPath = getSubPath(url, 'auth-custom')
  const path = rawPath.startsWith('/auth-custom') 
   ? rawPath.slice('/auth-custom'.length) || '/'
   : rawPath
  console.log('DEBUG fixed path:', path)
  console.log('DEBUG path:', path)
  console.log('DEBUG url.pathname:', url.pathname)
  const method = req.method
  const supabase = getSupabase()

  try {
    // POST /register
    if (method === 'POST' && path === '/register') {
      const body = await req.json()
      const email = String(body.email ?? '').trim().toLowerCase()
      const username = String(body.username ?? '').trim()
      const password = String(body.password ?? '')

      if (!email || !username || !password) {
        return errorResponse('email, username, and password are required', 400)
      }

      const { data: emailUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle()
      if (emailUser) return errorResponse('An account with this email already exists.', 409)

      const { data: usernameUser } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .maybeSingle()
      if (usernameUser) return errorResponse('This username is already taken.', 409)

      const passwordHash = await bcrypt.hash(password, 10)
      const userId = crypto.randomUUID()
      const verifyToken = crypto.randomUUID()
      const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

      const { data: user, error } = await supabase
        .from('users')
        .insert({
          id: userId,
          email,
          username,
          password_hash: passwordHash,
          name: username,
          role: 'user',
          last_login: new Date().toISOString(),
          email_verified: false,
          email_verify_token: verifyToken,
          email_verify_token_expires_at: verifyExpires,
        })
        .select()
        .single()

      if (error) throw error

      // Send email verification link (best-effort, never blocks registration).
      // Referral validation happens after email is verified, not here.
      try {
        const verifyUrl = `${SITE_URL}/verify-email?token=${verifyToken}`
        const tpl = verifyEmailEmail(verifyUrl)
        await sendEmail({ to: email, subject: tpl.subject, html: tpl.html })
      } catch (verErr) {
        console.error('verify email send error:', verErr)
      }

      const token = await createAccessToken({
        sub: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        last_login: user.last_login,
      })

      return jsonResponse({
        token,
        user_id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      })
    }

    // POST /login
    if (method === 'POST' && path === '/login') {
      const body = await req.json()
      const email = String(body.email ?? '').trim().toLowerCase()
      const password = String(body.password ?? '')

      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .maybeSingle()

      if (!user || !user.password_hash) {
        return errorResponse('Invalid email or password.', 401)
      }

      const valid = await bcrypt.compare(password, user.password_hash)
      if (!valid) return errorResponse('Invalid email or password.', 401)

      if (!user.email_verified) {
        return errorResponse('Please verify your email address before signing in. Check your inbox for the verification link.', 403)
      }

      const now = new Date().toISOString()
      await supabase.from('users').update({ last_login: now }).eq('id', user.id)

      const token = await createAccessToken({
        sub: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        last_login: now,
      })

      return jsonResponse({
        token,
        user_id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        first_name: user.first_name ?? null,
      })
    }

    // POST /verify-email
    if (method === 'POST' && path === '/verify-email') {
      const body = await req.json()
      const token = String(body.token ?? '').trim()
      if (!token) return errorResponse('Token is required', 400)

      const { data: user } = await supabase
        .from('users')
        .select('id, email, first_name, last_name, email_verified, email_verify_token_expires_at')
        .eq('email_verify_token', token)
        .maybeSingle()

      if (!user) return errorResponse('Invalid or expired verification link.', 400)
      if (user.email_verified) return jsonResponse({ success: true, message: 'Email already verified.' })

      const expires = new Date(user.email_verify_token_expires_at)
      if (expires < new Date()) return errorResponse('This verification link has expired. Please request a new one.', 400)

      await supabase.from('users').update({
        email_verified: true,
        email_verify_token: null,
        email_verify_token_expires_at: null,
      }).eq('id', user.id)

      // Validate any pending referrals for this email now that it's confirmed
      try {
        const { data: pendingRefs } = await supabase
          .from('referrals')
          .select('id, user_id')
          .eq('referred_email', user.email)
          .eq('is_validated', false)
        if (pendingRefs && pendingRefs.length > 0) {
          await supabase.from('referrals')
            .update({ is_validated: true })
            .eq('referred_email', user.email)
            .eq('is_validated', false)
          const referrerIds = [...new Set(pendingRefs.map((r: { user_id: string }) => r.user_id))]
          for (const rid of referrerIds) {
            const { data: referrer } = await supabase
              .from('users').select('email, name, username').eq('id', rid).maybeSingle()
            if (referrer?.email) {
              const tpl = referralJoinedEmail(user.first_name ?? user.email ?? null)
              await sendEmail({ to: referrer.email, subject: tpl.subject, html: tpl.html })
            }
          }
        }
      } catch (refErr) {
        console.error('referral validation error:', refErr)
      }

      // Send welcome email now that email is confirmed
      try {
        const tpl = welcomeEmail(user.first_name ?? null)
        await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html })
      } catch { /* silent */ }

      // Schedule Curt's follow-up letters via Resend scheduled delivery:
      // Letter 2 "A Quick Note About Winning" ~24h after verifying,
      // Letter 3 "A Few Fun Features" ~48h after. Best-effort, never blocks.
      try {
        const tpl2 = secondLetterEmail(user.first_name ?? null)
        await sendEmail({
          to: user.email, subject: tpl2.subject, html: tpl2.html,
          scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
      } catch { /* silent */ }
      try {
        const tpl3 = thirdLetterEmail(user.first_name ?? null)
        await sendEmail({
          to: user.email, subject: tpl3.subject, html: tpl3.html,
          scheduledAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        })
      } catch { /* silent */ }

      // Notify admin
      try {
        const tpl = newPlayerNotificationEmail(user.first_name ?? '', user.last_name ?? '', user.email)
        await sendEmail({ to: ADMIN_EMAIL, subject: tpl.subject, html: tpl.html })
      } catch { /* silent */ }

      return jsonResponse({ success: true, message: 'Email verified! You can now sign in.' })
    }

    // POST /resend-verification
    if (method === 'POST' && path === '/resend-verification') {
      const body = await req.json()
      const email = String(body.email ?? '').trim().toLowerCase()
      if (!email) return errorResponse('Email is required', 400)

      const { data: user } = await supabase
        .from('users')
        .select('id, email, email_verified')
        .eq('email', email)
        .maybeSingle()

      // Always return success to avoid revealing whether an email is registered
      if (!user || user.email_verified) {
        return jsonResponse({ success: true, message: 'If that email exists and is unverified, a new link has been sent.' })
      }

      const newToken = crypto.randomUUID()
      const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

      await supabase.from('users').update({
        email_verify_token: newToken,
        email_verify_token_expires_at: newExpires,
      }).eq('id', user.id)

      try {
        const verifyUrl = `${SITE_URL}/verify-email?token=${newToken}`
        const tpl = verifyEmailEmail(verifyUrl)
        await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html })
      } catch { /* silent */ }

      return jsonResponse({ success: true, message: 'If that email exists and is unverified, a new link has been sent.' })
    }

    // POST /logout
    if (method === 'POST' && path === '/logout') {
      return jsonResponse({ success: true, message: 'Logged out.' })
    }

    // POST /change-password
    if (method === 'POST' && path === '/change-password') {
      const authUser = await getAuthUser(req)
      const user = requireAuth(authUser)
      const body = await req.json()
      const currentPassword = String(body.current_password ?? '')
      const newPassword = String(body.new_password ?? '')
      if (!currentPassword || !newPassword) return errorResponse('current_password and new_password are required', 400)
      if (newPassword.length < 8) return errorResponse('New password must be at least 8 characters', 400)

      const { data: dbUser } = await supabase.from('users').select('password_hash').eq('id', user.sub).maybeSingle()
      if (!dbUser?.password_hash) return errorResponse('User not found', 404)

      const valid = await bcrypt.compare(currentPassword, dbUser.password_hash)
      if (!valid) return errorResponse('Current password is incorrect', 401)

      const newHash = await bcrypt.hash(newPassword, 10)
      await supabase.from('users').update({ password_hash: newHash }).eq('id', user.sub)
      return jsonResponse({ success: true })
    }

    // GET /me
    if (method === 'GET' && path === '/me') {
      const user = await getAuthUser(req)
      requireAuth(user)
      return jsonResponse({
        id: user!.sub,
        email: user!.email,
        name: user!.name,
        role: user!.role,
        last_login: user!.last_login,
      })
    }

    return errorResponse('Not found', 404)
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'status' in err) {
      const e = err as { status: number; detail: string }
      return errorResponse(e.detail, e.status)
    }
    console.error('auth-custom error:', err)
    return errorResponse('Internal server error', 500)
  }
})
