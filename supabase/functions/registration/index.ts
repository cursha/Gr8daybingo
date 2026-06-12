import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthUser, requireAuth } from '../_shared/auth.ts'
import { getSupabase, getSubPath } from '../_shared/db.ts'

const DEFAULT_SIGNUP_BONUS = 15.0

async function getSignupBonusAmount(supabase: ReturnType<typeof getSupabase>): Promise<number> {
  try {
    const { data } = await supabase
      .from('game_configs')
      .select('config_value')
      .eq('config_key', 'signup_bonus_amount')
      .maybeSingle()
    if (data?.config_value != null) {
      const amount = parseFloat(data.config_value)
      return amount >= 0 ? amount : DEFAULT_SIGNUP_BONUS
    }
  } catch { /* fall through */ }
  return DEFAULT_SIGNUP_BONUS
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  const url = new URL(req.url)
  const path = getSubPath(url, 'registration')
  const method = req.method
  const supabase = getSupabase()

  try {
    const authUser = await getAuthUser(req)

    // GET /status
    if (method === 'GET' && path === '/status') {
      const user = requireAuth(authUser)
      const { data, error } = await supabase
        .from('users')
        .select(`
          profile_completed, signup_bonus_granted, first_name, last_name, email,
          province_state, country, challenge_level, city,
          country_id, state_id, player_number,
          countries(id, name, code),
          states(id, name, code)
        `)
        .eq('id', user.sub)
        .maybeSingle()
      if (error) throw error
      if (!data) return errorResponse('User not found', 404)

      const bonusAmount = await getSignupBonusAmount(supabase)
      return jsonResponse({
        profile_completed: !!data.profile_completed,
        signup_bonus_granted: !!data.signup_bonus_granted,
        first_name: data.first_name ?? null,
        last_name: data.last_name ?? null,
        email: data.email ?? null,
        province_state: data.province_state ?? null,
        country: data.country ?? null,
        challenge_level: data.challenge_level ?? null,
        city: data.city ?? null,
        country_id: data.country_id ?? null,
        state_id: data.state_id ?? null,
        player_number: data.player_number ?? null,
        country_obj: data.countries ?? null,
        state_obj: data.states ?? null,
        signup_bonus_amount: bonusAmount,
      })
    }

    // POST /register
    if (method === 'POST' && path === '/register') {
      const user = requireAuth(authUser)
      const body = await req.json()

      const firstName = String(body.first_name ?? '').trim()
      const lastName = String(body.last_name ?? '').trim()
      const email = String(body.email ?? '').trim().toLowerCase()

      if (!firstName || !lastName || !email) {
        return errorResponse('first_name, last_name, and email are required', 400)
      }

      // Optional profile fields
      const city = body.city != null ? String(body.city).trim() || null : null
      const countryId = body.country_id != null ? parseInt(body.country_id) || null : null
      const stateId = body.state_id != null ? parseInt(body.state_id) || null : null

      // Keep legacy text fields in sync for backward compat
      const provinceState = body.province_state != null ? String(body.province_state).trim() : null
      const country = body.country != null ? String(body.country).trim() : null

      let challengeLevel: number | null = null
      if (body.challenge_level != null && String(body.challenge_level).trim() !== '') {
        const lvl = Number(body.challenge_level)
        if (Number.isFinite(lvl) && lvl >= 1 && lvl <= 5) challengeLevel = Math.round(lvl)
      }

      const { data: dbUser, error: userErr } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.sub)
        .maybeSingle()
      if (userErr) throw userErr
      if (!dbUser) return errorResponse('User not found', 404)

      // Update user profile
      await supabase.from('users').update({
        first_name: firstName,
        last_name: lastName,
        email,
        name: dbUser.name || `${firstName} ${lastName}`.trim(),
        city,
        country_id: countryId,
        state_id: stateId,
        province_state: provinceState,
        country,
        challenge_level: challengeLevel,
        profile_completed: true,
      }).eq('id', user.sub)

      // Ensure wallet exists
      let { data: wallet } = await supabase
        .from('player_wallets')
        .select('*')
        .eq('user_id', user.sub)
        .maybeSingle()

      if (!wallet) {
        const { data: newWallet, error: wErr } = await supabase
          .from('player_wallets')
          .insert({ user_id: user.sub, balance: 0 })
          .select()
          .single()
        if (wErr) throw wErr
        wallet = newWallet
      }

      const bonusAmount = await getSignupBonusAmount(supabase)
      let bonusGranted = false
      let walletBalance = parseFloat(wallet.balance ?? 0)

      if (!dbUser.signup_bonus_granted && bonusAmount > 0) {
        walletBalance += bonusAmount
        await supabase.from('player_wallets')
          .update({ balance: walletBalance, updated_at: new Date().toISOString() })
          .eq('user_id', user.sub)

        await supabase.from('users')
          .update({ signup_bonus_granted: true })
          .eq('id', user.sub)

        await supabase.from('wallet_transactions').insert({
          user_id: user.sub,
          amount: bonusAmount,
          transaction_type: 'signup_bonus',
          item_description: `Welcome bonus for completing registration ($${bonusAmount.toFixed(2)})`,
        })

        bonusGranted = true
      } else if (!dbUser.signup_bonus_granted) {
        await supabase.from('users')
          .update({ signup_bonus_granted: true })
          .eq('id', user.sub)
      }

      return jsonResponse({
        success: true,
        message: bonusGranted
          ? `Welcome! $${bonusAmount.toFixed(2)} has been credited to your wallet.`
          : 'Profile updated.',
        bonus_granted: bonusGranted,
        wallet_balance: walletBalance,
        first_name: firstName,
        last_name: lastName,
        email,
        profile_completed: true,
      })
    }

    return errorResponse('Not found', 404)
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'status' in err) {
      const e = err as { status: number; detail: string }
      return errorResponse(e.detail, e.status)
    }
    console.error('registration error:', err)
    return errorResponse('Internal server error', 500)
  }
})
