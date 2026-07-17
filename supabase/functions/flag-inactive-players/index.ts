import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getSupabase } from '../_shared/db.ts'

// Daily sweep: flags a player inactive (is_active = false) once their
// last completed deed (users.last_valid_deed_date, falling back to
// created_at for players who never played) is older than the admin-
// configured window (game_configs.inactive_days_threshold, default 30
// days).
//
// This exists because /generate-card (game/index.ts) only re-evaluates a
// player's own is_active flag when THEY load the game — a player who goes
// quiet and never opens the app again would otherwise stay flagged active
// forever. Reactivation (is_active -> true) stays exclusively driven by
// /generate-card, since that's the only place we actually know a player is
// back; this sweep only ever flips active -> inactive.
Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  // Allow GET for cron invocation, POST for manual trigger
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
    const { data: cfg } = await supabase
      .from('game_configs').select('config_value').eq('config_key', 'inactive_days_threshold').maybeSingle()
    const thresholdDays = parseInt(cfg?.config_value ?? '30')
    const cutoff = new Date(Date.now() - thresholdDays * 86_400_000).toISOString().slice(0, 10)

    const { data: flagged, error } = await supabase
      .from('users')
      .update({ is_active: false })
      .eq('role', 'user')
      .eq('is_active', true)
      .or(`last_valid_deed_date.lt.${cutoff},and(last_valid_deed_date.is.null,created_at.lt.${cutoff})`)
      .select('id')

    if (error) throw error

    return jsonResponse({ success: true, flagged_inactive: flagged?.length ?? 0, threshold_days: thresholdDays })
  } catch (err) {
    console.error('flag-inactive-players error:', err)
    return errorResponse('Internal server error', 500)
  }
})
