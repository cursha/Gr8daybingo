import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthUser, requireAdmin } from '../_shared/auth.ts'
import { getSupabase, getSubPath, matchPath } from '../_shared/db.ts'

/**
 * Admin settings function.
 * Manages non-sensitive game configuration stored in the game_configs table.
 * Secret keys (JWT, Stripe, etc.) must be set as Supabase Secrets via the dashboard.
 */
Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  const url = new URL(req.url)
  const path = getSubPath(url, 'admin-settings')
  const method = req.method
  const supabase = getSupabase()

  try {
    const authUser = await getAuthUser(req)

    // admin_password is a bcrypt hash with its own dedicated verify/reset
    // flow (game/index.ts POST /admin/verify, /admin/reset-password) — never
    // let this generic config CRUD read, overwrite (as plaintext), or delete it.
    const SENSITIVE_KEYS = new Set(['admin_password'])

    // GET / — list all game configs as "backend_vars"
    if (method === 'GET' && (path === '/' || path === '')) {
      requireAdmin(authUser)
      const { data, error } = await supabase
        .from('game_configs')
        .select('config_key, config_value, description')
      if (error) throw error

      const backendVars: Record<string, { key: string; value: string; description: string }> = {}
      for (const row of data ?? []) {
        if (SENSITIVE_KEYS.has(row.config_key)) continue
        backendVars[row.config_key] = {
          key: row.config_key,
          value: row.config_value ?? '',
          description: row.description ?? '',
        }
      }
      return jsonResponse({ backend_vars: backendVars, frontend_vars: {} })
    }

    // PUT /backend/:key — update a game config value
    const putMatch = matchPath('/backend/:key', path)
    if (method === 'PUT' && putMatch) {
      requireAdmin(authUser)
      if (SENSITIVE_KEYS.has(putMatch.key)) return errorResponse('This setting cannot be changed here', 403)
      const body = await req.json()
      const value = String(body.value ?? '')
      const { error } = await supabase
        .from('game_configs')
        .update({ config_value: value, updated_at: new Date().toISOString() })
        .eq('config_key', putMatch.key)
      if (error) throw error
      return jsonResponse({
        message: `Configuration '${putMatch.key}' updated successfully.`,
      })
    }

    // POST /backend/:key — add/upsert a game config value
    const postMatch = matchPath('/backend/:key', path)
    if (method === 'POST' && postMatch) {
      requireAdmin(authUser)
      if (SENSITIVE_KEYS.has(postMatch.key)) return errorResponse('This setting cannot be changed here', 403)
      const body = await req.json()
      const value = String(body.value ?? '')
      const { error } = await supabase
        .from('game_configs')
        .upsert(
          { config_key: postMatch.key, config_value: value, updated_at: new Date().toISOString() },
          { onConflict: 'config_key' },
        )
      if (error) throw error
      return jsonResponse({
        message: `Configuration '${postMatch.key}' added successfully.`,
      })
    }

    // DELETE /backend/:key — remove a game config entry
    const deleteMatch = matchPath('/backend/:key', path)
    if (method === 'DELETE' && deleteMatch) {
      requireAdmin(authUser)
      if (SENSITIVE_KEYS.has(deleteMatch.key)) return errorResponse('This setting cannot be changed here', 403)
      const { data: existing } = await supabase
        .from('game_configs')
        .select('id')
        .eq('config_key', deleteMatch.key)
        .maybeSingle()
      if (!existing) return errorResponse(`Configuration '${deleteMatch.key}' does not exist`, 404)

      const { error } = await supabase
        .from('game_configs')
        .delete()
        .eq('config_key', deleteMatch.key)
      if (error) throw error
      return jsonResponse({ message: `Configuration '${deleteMatch.key}' deleted.` })
    }

    return errorResponse('Not found', 404)
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'status' in err) {
      const e = err as { status: number; detail: string }
      return errorResponse(e.detail, e.status)
    }
    console.error('admin-settings error:', err)
    return errorResponse('Internal server error', 500)
  }
})
