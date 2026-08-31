// =============================================================================
// Prize claims: a winning player submitting their contact info, and admin
// managing the claim queue (including the fulfilled-status voucher email).
// Extracted wholesale out of game/index.ts; behavior is unchanged.
// =============================================================================
import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requireAuth, requireAdmin } from '../../_shared/auth.ts'
import { matchPath } from '../../_shared/db.ts'
import { getCurrentWeekYear } from '../../_shared/week.ts'
import { getPlayerCurrentCard } from '../../_shared/card_helpers.ts'
import { sendEmail, prizeClaimConfirmationEmail, prizeVoucherEmail } from '../../_shared/email.ts'
import { RouteHandler } from '../route_types.ts'

export const handlePrizesRoutes: RouteHandler = async ({ req, path, method, authUser, supabase }) => {
  // ── POST /claim-prize ─────────────────────────────────────────────────────
  if (method === 'POST' && path === '/claim-prize') {
    const user = requireAuth(authUser)

    // Anonymous accounts (Issue #17) have no contact info, so they are not
    // eligible for prizes. Enforced server-side.
    const { data: claimant } = await supabase
      .from('users').select('registration_type').eq('id', user.sub).maybeSingle()
    if (claimant?.registration_type === 'anonymous') {
      return errorResponse(
        'Anonymous accounts are not eligible for prizes because we have no way to contact you.',
        403,
      )
    }

    const body = await req.json()
    const { full_name, email, phone, mailing_address, notes } = body

    if (!full_name || !email) return errorResponse('Name and email are required', 400)

    const weekYear = getCurrentWeekYear()

    // Verify the player's current card (whichever week it was created in)
    // has actually won — a card's win doesn't expire just because the
    // calendar moved on since it was generated.
    const card = await getPlayerCurrentCard(supabase, user.sub)
    if (!card || !card.is_bingo) return errorResponse('No winning card found', 400)

    // Prevent duplicate claims
    const { data: existing } = await supabase
      .from('prize_claims').select('id').eq('user_id', user.sub).eq('week_year', weekYear).maybeSingle()
    if (existing) return errorResponse('You have already submitted a claim for this week', 400)

    const { error } = await supabase.from('prize_claims').insert({
      user_id: user.sub,
      week_year: weekYear,
      full_name: String(full_name).trim(),
      email: String(email).trim().toLowerCase(),
      phone: phone ? String(phone).trim() : null,
      mailing_address: mailing_address ? String(mailing_address).trim() : null,
      notes: notes ? String(notes).trim() : null,
      status: 'pending',
    })
    if (error) throw error

    // Confirmation email to the claimant (best-effort).
    const claimantEmail = String(email).trim().toLowerCase()
    if (claimantEmail) {
      const tpl = prizeClaimConfirmationEmail(String(full_name).trim() || null)
      await sendEmail({ to: claimantEmail, subject: tpl.subject, html: tpl.html })
    }

    return jsonResponse({ success: true, message: 'Prize claim submitted! We will contact you within 48 hours.' })
  }

  // ── GET /admin/prize-claims ───────────────────────────────────────────────
  if (method === 'GET' && path === '/admin/prize-claims') {
    requireAdmin(authUser)
    const { data } = await supabase
      .from('prize_claims').select('*').order('created_at', { ascending: false })
    return jsonResponse({
      claims: (data ?? []).map((c) => ({
        id: c.id,
        user_id: c.user_id,
        week_year: c.week_year,
        full_name: c.full_name,
        email: c.email,
        phone: c.phone ?? null,
        mailing_address: c.mailing_address ?? null,
        notes: c.notes ?? null,
        status: c.status,
        created_at: c.created_at,
      })),
    })
  }

  // ── PUT /admin/prize-claims/:id ───────────────────────────────────────────
  const claimMatch = matchPath('/admin/prize-claims/:id', path)
  if (method === 'PUT' && claimMatch) {
    requireAdmin(authUser)
    const body = await req.json()
    const { status } = body
    if (!['pending', 'contacted', 'fulfilled', 'rejected'].includes(status)) {
      return errorResponse('Invalid status', 400)
    }
    const claimId = parseInt(claimMatch.id)
    const { data: existingClaim } = await supabase
      .from('prize_claims').select('full_name, email, status').eq('id', claimId).maybeSingle()
    const { error } = await supabase.from('prize_claims')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', claimId)
    if (error) throw error

    // Email the voucher code the moment a claim newly becomes "fulfilled" —
    // never on re-saving an already-fulfilled claim, and best-effort so a
    // send failure never breaks the status update itself.
    if (status === 'fulfilled' && existingClaim && existingClaim.status !== 'fulfilled' && existingClaim.email) {
      try {
        const { data: cfgRows } = await supabase
          .from('game_configs').select('config_key, config_value')
          .in('config_key', ['prize_title', 'prize_voucher_code', 'prize_image_url'])
        const cfg: Record<string, string> = {}
        for (const r of cfgRows ?? []) cfg[r.config_key] = r.config_value ?? ''
        if (cfg['prize_voucher_code']) {
          const tpl = prizeVoucherEmail(existingClaim.full_name ?? null, cfg['prize_title'] ?? null, cfg['prize_voucher_code'], cfg['prize_image_url'] ?? null)
          await sendEmail({ to: existingClaim.email, subject: tpl.subject, html: tpl.html })
        }
      } catch (err) {
        console.error('[prize-voucher-email] failed to send', err)
      }
    }

    return jsonResponse({ success: true })
  }

  return null
}
