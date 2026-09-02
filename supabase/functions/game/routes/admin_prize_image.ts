// =============================================================================
// Admin: upload a prize image to Supabase Storage. Admin auth here is the
// app's own custom JWT (see _shared/auth.ts), never a Supabase Auth session,
// so there is no way for a client-side supabase.storage.upload() call to
// satisfy Storage RLS — this route uploads with the service-role client
// instead, gated by requireAdmin, matching admin_config.ts's pattern.
// =============================================================================
import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requireAdmin } from '../../_shared/auth.ts'
import { RouteHandler } from '../route_types.ts'

const BUCKET = 'prize-images'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export const handleAdminPrizeImageRoutes: RouteHandler = async ({ req, path, method, authUser, supabase }) => {
  // ── POST /admin/prize-image ───────────────────────────────────────────────
  if (method === 'POST' && path === '/admin/prize-image') {
    requireAdmin(authUser)

    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!file || !(file instanceof File)) return errorResponse('file is required', 400)

    const ext = ALLOWED_TYPES[file.type]
    if (!ext) return errorResponse('Only PNG, JPEG, or WebP images are allowed', 400)
    if (file.size > MAX_BYTES) return errorResponse('Image must be 5MB or smaller', 400)

    const key = `prize-${Date.now()}.${ext}`
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(key, file, { contentType: file.type, upsert: false })
    if (uploadErr) return errorResponse(`Upload failed: ${uploadErr.message}`, 500)

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(key)
    return jsonResponse({ url: pub.publicUrl })
  }

  return null
}
