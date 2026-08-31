// =============================================================================
// Deed catalog management: admin CRUD on good_deeds (including bulk status
// changes and CSV-style import), deed targeting, player deed suggestions,
// and the admin review queue for those suggestions. Extracted wholesale out
// of game/index.ts; behavior is unchanged.
// =============================================================================
import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requireAuth, requireAdmin } from '../../_shared/auth.ts'
import { matchPath } from '../../_shared/db.ts'
import { RouteHandler } from '../route_types.ts'

// good_deeds.category is NOT NULL with a FOREIGN KEY into deed_categories
// (migration 20260709000002) — every deed must carry a real category, no
// exceptions. 23502 = not-null violation, 23503 = foreign-key violation
// (an empty string or a name that isn't a real category).
function friendlyDeedCategoryError(error: { code?: string } | null): string | null {
  if (!error) return null
  if (error.code === '23502' || error.code === '23503') return 'A valid category is required.'
  return null
}

export const handleAdminDeedsRoutes: RouteHandler = async ({ req, url, method, path, authUser, supabase }) => {
  // ── GET /admin/deeds ──────────────────────────────────────────────────────
  if (method === 'GET' && path === '/admin/deeds') {
    requireAdmin(authUser)
    const { data } = await supabase.from('good_deeds').select('*').order('id')
    return jsonResponse({
      deeds: (data ?? []).map((d) => ({
        id: d.id, deed_text: d.deed_text, deed_text_long: d.deed_text_long ?? null,
        category: d.category, is_active: d.is_active, complexity: d.complexity ?? null,
        quantity: d.quantity ?? 1, quick_tap_eligible: d.quick_tap_eligible ?? false,
        quick_tap_default: d.quick_tap_default ?? false, quick_tap_label: d.quick_tap_label ?? null,
        status: d.status ?? 'Draft',
      })),
    })
  }

  // ── POST /admin/deeds ─────────────────────────────────────────────────────
  if (method === 'POST' && path === '/admin/deeds') {
    requireAdmin(authUser)
    const body = await req.json()
    const VALID_STATUSES = ['Draft', 'Review', 'Approved', 'Retired']
    if (!String(body.category ?? '').trim()) return errorResponse('A category is required', 400)
    const quickTapEligible = body.quick_tap_eligible === true
    const quickTapLabel = body.quick_tap_label != null ? String(body.quick_tap_label).trim() : ''
    if (quickTapLabel.length > 36) return errorResponse('Quick Tap label must be 36 characters or fewer', 400)
    if (quickTapEligible && !quickTapLabel) return errorResponse('Quick Tap label is required when Quick Tap eligible is on', 400)
    const { data, error } = await supabase.from('good_deeds').insert({
      deed_text: body.deed_text ?? '',
      deed_text_long: body.deed_text_long || null,
      category: body.category,
      is_active: body.is_active ?? true,
      complexity: body.complexity != null ? Number(body.complexity) : null,
      quantity: body.quantity != null ? Math.max(1, Math.round(Number(body.quantity)) || 1) : 1,
      quick_tap_eligible: quickTapEligible,
      quick_tap_default: body.quick_tap_default === true,
      quick_tap_label: quickTapLabel || null,
      status: VALID_STATUSES.includes(body.status) ? body.status : 'Draft',
    }).select().single()
    if (error) {
      const friendly = friendlyDeedCategoryError(error)
      if (friendly) return errorResponse(friendly, 400)
      throw error
    }
    return jsonResponse({ id: data.id, deed_text: data.deed_text, deed_text_long: data.deed_text_long, category: data.category, is_active: data.is_active, complexity: data.complexity ?? null, quantity: data.quantity ?? 1, quick_tap_eligible: data.quick_tap_eligible ?? false, quick_tap_default: data.quick_tap_default ?? false, quick_tap_label: data.quick_tap_label ?? null, status: data.status ?? 'Draft' })
  }

  // ── POST /admin/deeds/bulk-status ─────────────────────────────────────────
  // Bulk-update the workflow status of multiple deeds at once (e.g. approving
  // a whole reviewed batch, or bulk-retiring a category), separate from the
  // single-deed PUT below.
  if (method === 'POST' && path === '/admin/deeds/bulk-status') {
    requireAdmin(authUser)
    const body = await req.json()
    const VALID_STATUSES = ['Draft', 'Review', 'Approved', 'Retired']
    const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number).filter((n: number) => Number.isFinite(n) && n > 0) : []
    const status = String(body.status ?? '')
    if (ids.length === 0) return errorResponse('At least one deed id is required', 400)
    if (!VALID_STATUSES.includes(status)) return errorResponse('status must be one of Draft, Review, Approved, Retired', 400)
    const { error } = await supabase.from('good_deeds').update({ status }).in('id', ids)
    if (error) throw error
    return jsonResponse({ success: true, updated: ids.length })
  }

  // ── POST /admin/deeds/import ──────────────────────────────────────────────
  if (method === 'POST' && path === '/admin/deeds/import') {
    requireAdmin(authUser)
    const body = await req.json()
    const rows: Array<Record<string, unknown>> = body.deeds ?? []
    let updated = 0, created = 0, skipped = 0
    const warnings: string[] = []

    // Build a lookup of existing deeds by lowercased text so an upload with a
    // blank id matches an existing deed by NAME instead of creating a duplicate.
    const { data: allDeeds } = await supabase.from('good_deeds').select('id, deed_text')
    const idByText = new Map<string, number>()
    for (const d of allDeeds ?? []) {
      idByText.set(String(d.deed_text ?? '').trim().toLowerCase(), d.id)
    }

    // Strict boolean parsing: only the literal "true" (any case) is truthy.
    const parseStrictBool = (v: unknown): boolean =>
      String(v ?? '').trim().toLowerCase() === 'true'

    // Clamp quantity to the allowed 1–4 range; default to 1.
    const parseQuantity = (v: unknown): number => {
      const n = Number(v)
      if (!Number.isFinite(n)) return 1
      return Math.max(1, Math.round(n))
    }

    // Build targeting lookup if any targeting_* columns are present.
    const targetingKeys = Object.keys(rows[0] ?? {}).filter((k) => k.startsWith('targeting_'))
    type AttrInfo = { labels: Map<string, number> }
    const attrBySlug = new Map<string, AttrInfo>()
    if (targetingKeys.length > 0) {
      const { data: attrs } = await supabase.from('targeting_attributes').select('id, name').eq('is_active', true)
      const { data: vals } = await supabase.from('targeting_values').select('id, attribute_id, label').eq('is_active', true)
      const valsByAttr = new Map<number, typeof vals>()
      for (const v of vals ?? []) {
        if (!valsByAttr.has(v.attribute_id)) valsByAttr.set(v.attribute_id, [])
        valsByAttr.get(v.attribute_id)!.push(v)
      }
      for (const attr of attrs ?? []) {
        const slug = 'targeting_' + attr.name.toLowerCase().replace(/\s+/g, '_')
        const labelMap = new Map<string, number>()
        for (const v of valsByAttr.get(attr.id) ?? []) {
          labelMap.set(String(v.label).toLowerCase(), v.id)
        }
        attrBySlug.set(slug, { labels: labelMap })
      }
      for (const key of targetingKeys) {
        if (!attrBySlug.has(key)) warnings.push(`Unknown targeting column "${key}" — ignored`)
      }
    }

    const validStatuses = new Set(['Draft', 'Review', 'Approved', 'Retired'])

    // Every real category name, so a bad/misspelled category can be reported
    // by name instead of just failing the insert with an opaque DB error.
    const validCategories = new Set((await supabase.from('deed_categories').select('name')).data?.map((c) => c.name) ?? [])

    for (const row of rows) {
      const text = String(row.deed_text ?? '').trim()
      if (!text) { skipped++; continue }

      // good_deeds.category is NOT NULL with a foreign key into
      // deed_categories (migration 20260709000002) — every deed must have
      // a real category. Reject the row explicitly here, by name, rather
      // than letting it fail the insert/update below with a generic error.
      const categoryVal = row.category ? String(row.category).trim() : ''
      if (!categoryVal) { skipped++; warnings.push(`Row "${text}" skipped — category is required`); continue }
      if (!validCategories.has(categoryVal)) { skipped++; warnings.push(`Row "${text}" skipped — unknown category "${categoryVal}"`); continue }

      const complexityVal = (row.complexity != null && String(row.complexity).trim() !== '')
        ? (Number(row.complexity) || null)
        : null
      // Blank/invalid status: leave existing rows untouched, default new rows to Draft.
      const statusRaw = row.status != null ? String(row.status).trim() : ''
      const statusVal = validStatuses.has(statusRaw) ? statusRaw : null

      const quickTapEligibleVal = parseStrictBool(row.quick_tap_eligible)
      const quickTapLabelVal = row.quick_tap_label ? String(row.quick_tap_label).trim() : ''
      if (quickTapLabelVal.length > 36) { skipped++; warnings.push(`Row "${text}" skipped — quick_tap_label must be 36 characters or fewer`); continue }
      if (quickTapEligibleVal && !quickTapLabelVal) { skipped++; warnings.push(`Row "${text}" skipped — quick_tap_label is required when quick_tap_eligible is true`); continue }

      const payload: Record<string, unknown> = {
        deed_text: text,
        deed_text_long: row.deed_text_long ? String(row.deed_text_long).trim() || null : null,
        category: categoryVal,
        complexity: complexityVal,
        quantity: parseQuantity(row.quantity),
        is_active: parseStrictBool(row.is_active),
        quick_tap_eligible: quickTapEligibleVal,
        quick_tap_default: parseStrictBool(row.quick_tap_default),
        quick_tap_label: quickTapLabelVal || null,
      }

      // Determine the target row: explicit id wins, else match by name.
      const explicitId = row.id ? Number(row.id) : 0
      const matchedId = explicitId > 0 ? explicitId : (idByText.get(text.toLowerCase()) ?? 0)

      let resolvedId = matchedId
      if (matchedId > 0) {
        if (statusVal) payload.status = statusVal
        const { error } = await supabase.from('good_deeds').update(payload).eq('id', matchedId)
        if (!error) updated++; else { skipped++; continue }
      } else {
        payload.status = statusVal ?? 'Draft'
        const { data: inserted, error } = await supabase.from('good_deeds').insert(payload).select('id').single()
        if (!error && inserted) {
          created++
          resolvedId = inserted.id
          idByText.set(text.toLowerCase(), inserted.id)
        } else {
          skipped++; continue
        }
      }

      // Write targeting if columns were present in the CSV.
      if (targetingKeys.length > 0 && resolvedId > 0) {
        const valueIds: number[] = []
        for (const key of targetingKeys) {
          const attrInfo = attrBySlug.get(key)
          if (!attrInfo) continue
          const raw = String(row[key] ?? '').trim()
          if (!raw) continue
          for (const label of raw.split('|').map((l: string) => l.trim()).filter(Boolean)) {
            const valueId = attrInfo.labels.get(label.toLowerCase())
            if (valueId == null) {
              warnings.push(`Row "${text}": ${key} has unknown value "${label}"`)
            } else {
              valueIds.push(valueId)
            }
          }
        }
        // Scope the delete to only value_ids that belong to attributes present in this CSV.
        // Attributes not included as columns are left completely untouched.
        const presentAttrValueIds: number[] = []
        for (const key of targetingKeys) {
          const attrInfo = attrBySlug.get(key)
          if (attrInfo) for (const vId of attrInfo.labels.values()) presentAttrValueIds.push(vId)
        }
        if (presentAttrValueIds.length > 0) {
          await supabase.from('deed_targeting_values').delete()
            .eq('deed_id', resolvedId)
            .in('targeting_value_id', presentAttrValueIds)
        }
        if (valueIds.length > 0) {
          await supabase.from('deed_targeting_values').insert(valueIds.map((v) => ({ deed_id: resolvedId, targeting_value_id: v })))
        }
      }
    }
    return jsonResponse({ success: true, updated, created, skipped, total: updated + created, warnings })
  }

  // ── GET /admin/deeds/targeting-bulk ──────────────────────────────────────
  if (method === 'GET' && path === '/admin/deeds/targeting-bulk') {
    requireAdmin(authUser)
    const { data } = await supabase.from('deed_targeting_values').select('deed_id, targeting_value_id')
    return jsonResponse({ rows: data ?? [] })
  }

  // ── GET /admin/targeting-attributes ──────────────────────────────────────
  if (method === 'GET' && path === '/admin/targeting-attributes') {
    requireAdmin(authUser)
    const { data: attrs } = await supabase
      .from('targeting_attributes').select('id, name, display_order')
      .eq('is_active', true).order('display_order')
    const { data: vals } = await supabase
      .from('targeting_values').select('id, attribute_id, label, description, is_default, display_order')
      .eq('is_active', true).order('display_order')
    const valsByAttr = new Map<number, typeof vals>()
    for (const v of vals ?? []) {
      if (!valsByAttr.has(v.attribute_id)) valsByAttr.set(v.attribute_id, [])
      valsByAttr.get(v.attribute_id)!.push(v)
    }
    const attributes = (attrs ?? []).map((a) => ({
      id: a.id, name: a.name, display_order: a.display_order,
      values: valsByAttr.get(a.id) ?? [],
    }))
    return jsonResponse({ attributes })
  }

  // ── GET + PUT /admin/deeds/:id/targeting (must be before /:id PUT/DELETE) ─
  const deedTargetingMatch = path.match(/^\/admin\/deeds\/(\d+)\/targeting$/)
  if (method === 'GET' && deedTargetingMatch) {
    requireAdmin(authUser)
    const deedId = parseInt(deedTargetingMatch[1])
    const { data } = await supabase
      .from('deed_targeting_values').select('targeting_value_id').eq('deed_id', deedId)
    return jsonResponse({ targeting_value_ids: (data ?? []).map((r) => Number(r.targeting_value_id)) })
  }
  if (method === 'PUT' && deedTargetingMatch) {
    requireAdmin(authUser)
    const deedId = parseInt(deedTargetingMatch[1])
    const body = await req.json()
    const ids: number[] = (body.targeting_value_ids ?? []).map(Number).filter((n: number) => Number.isFinite(n) && n > 0)
    await supabase.from('deed_targeting_values').delete().eq('deed_id', deedId)
    if (ids.length > 0) {
      const rows = ids.map((v) => ({ deed_id: deedId, targeting_value_id: v }))
      const { error } = await supabase.from('deed_targeting_values').insert(rows)
      if (error) throw error
    }
    return jsonResponse({ success: true })
  }

  // ── PUT /admin/deeds/:id ──────────────────────────────────────────────────
  const deedPutMatch = matchPath('/admin/deeds/:id', path)
  if (method === 'PUT' && deedPutMatch) {
    requireAdmin(authUser)
    const body = await req.json()
    const updates: Record<string, unknown> = {}
    if ('deed_text' in body) updates.deed_text = body.deed_text
    if ('deed_text_long' in body) updates.deed_text_long = body.deed_text_long || null
    if ('category' in body) {
      if (!String(body.category ?? '').trim()) return errorResponse('A category is required', 400)
      updates.category = body.category
    }
    if ('is_active' in body) updates.is_active = body.is_active
    if ('complexity' in body) updates.complexity = body.complexity != null ? Number(body.complexity) : null
    if ('quantity' in body) updates.quantity = body.quantity != null ? Math.max(1, Math.round(Number(body.quantity)) || 1) : 1
    if ('quick_tap_eligible' in body) updates.quick_tap_eligible = body.quick_tap_eligible === true
    if ('quick_tap_default' in body) updates.quick_tap_default = body.quick_tap_default === true
    if ('quick_tap_label' in body) {
      const label = body.quick_tap_label != null ? String(body.quick_tap_label).trim() : ''
      if (label.length > 36) return errorResponse('Quick Tap label must be 36 characters or fewer', 400)
      updates.quick_tap_label = label || null
    }
    if ('status' in body && ['Draft', 'Review', 'Approved', 'Retired'].includes(body.status)) updates.status = body.status

    // Validate the RESULTING state, not just what's in this PUT body — a
    // toggle-only PUT (no label field) against a deed that's still
    // label-less must be rejected too, same as a label-only PUT that would
    // leave quick_tap_eligible=true with an empty label.
    if ('quick_tap_eligible' in updates || 'quick_tap_label' in updates) {
      const { data: existing } = await supabase.from('good_deeds')
        .select('quick_tap_eligible, quick_tap_label').eq('id', parseInt(deedPutMatch.id)).maybeSingle()
      const effectiveEligible = 'quick_tap_eligible' in updates ? updates.quick_tap_eligible === true : (existing?.quick_tap_eligible ?? false)
      const effectiveLabel = 'quick_tap_label' in updates ? updates.quick_tap_label : (existing?.quick_tap_label ?? null)
      if (effectiveEligible && !effectiveLabel) return errorResponse('Quick Tap label is required when Quick Tap eligible is on', 400)
    }

    const { data, error } = await supabase.from('good_deeds')
      .update(updates).eq('id', parseInt(deedPutMatch.id)).select().maybeSingle()
    if (error) {
      const friendly = friendlyDeedCategoryError(error)
      if (friendly) return errorResponse(friendly, 400)
      throw error
    }
    if (!data) return errorResponse('Deed not found', 404)
    return jsonResponse({ id: data.id, deed_text: data.deed_text, deed_text_long: data.deed_text_long, category: data.category, is_active: data.is_active, complexity: data.complexity ?? null, quantity: data.quantity ?? 1, quick_tap_eligible: data.quick_tap_eligible ?? false, quick_tap_default: data.quick_tap_default ?? false, quick_tap_label: data.quick_tap_label ?? null, status: data.status ?? 'Draft' })
  }

  // ── DELETE /admin/deeds/:id ───────────────────────────────────────────────
  const deedDeleteMatch = matchPath('/admin/deeds/:id', path)
  if (method === 'DELETE' && deedDeleteMatch) {
    requireAdmin(authUser)
    const { error } = await supabase.from('good_deeds').delete().eq('id', parseInt(deedDeleteMatch.id))
    if (error) throw error
    return jsonResponse({ success: true })
  }

  // ── POST /suggest-deed ────────────────────────────────────────────────────
  if (method === 'POST' && path === '/suggest-deed') {
    const user = requireAuth(authUser)
    const body = await req.json()
    const text = String(body.deed_text ?? '').trim()
    if (!text) return errorResponse('Deed text is required', 400)
    if (text.length > 500) return errorResponse('Deed text is too long (max 500 chars)', 400)
    const suggesterName = user.name ?? user.email ?? 'Anonymous'
    const { data, error } = await supabase.from('pending_deeds').insert({
      deed_text: text,
      category: String(body.category ?? '').trim() || null,
      notes: String(body.notes ?? '').trim() || null,
      suggested_by_user_id: user.sub,
      suggested_by_name: suggesterName,
      status: 'pending',
    }).select().single()
    if (error) throw error
    return jsonResponse({ success: true, message: 'Thanks! Your deed suggestion was submitted and is awaiting admin approval.', id: data.id })
  }

  // ── GET /my-suggestions ───────────────────────────────────────────────────
  if (method === 'GET' && path === '/my-suggestions') {
    const user = requireAuth(authUser)
    const { data } = await supabase.from('pending_deeds').select('*')
      .eq('suggested_by_user_id', user.sub)
      .order('created_at', { ascending: false })
    return jsonResponse({
      suggestions: (data ?? []).map((p) => ({
        id: p.id, deed_text: p.deed_text, category: p.category, notes: p.notes,
        status: p.status, created_at: p.created_at,
      })),
    })
  }

  // ── GET /admin/pending-deeds ──────────────────────────────────────────────
  if (method === 'GET' && path === '/admin/pending-deeds') {
    requireAdmin(authUser)
    const statusFilter = url.searchParams.get('status') ?? 'pending'
    let query = supabase.from('pending_deeds').select('*')
    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    const { data } = await query.order('created_at', { ascending: false })
    return jsonResponse({
      pending_deeds: (data ?? []).map((p) => ({
        id: p.id, deed_text: p.deed_text, category: p.category, notes: p.notes,
        suggested_by_name: p.suggested_by_name, status: p.status, created_at: p.created_at,
      })),
    })
  }

  // ── POST /admin/pending-deeds/:id/approve ─────────────────────────────────
  const approveMatch = matchPath('/admin/pending-deeds/:id/approve', path)
  if (method === 'POST' && approveMatch) {
    requireAdmin(authUser)
    const { data: pending } = await supabase.from('pending_deeds')
      .select('*').eq('id', parseInt(approveMatch.id)).maybeSingle()
    if (!pending) return errorResponse('Pending deed not found', 404)
    if (pending.status === 'approved') return errorResponse('Already approved', 400)
    const { data: newDeed, error } = await supabase.from('good_deeds').insert({
      deed_text: pending.deed_text, deed_text_long: null,
      category: pending.category ?? 'Community', is_active: true, status: 'Approved',
    }).select().single()
    if (error) throw error
    await supabase.from('pending_deeds').update({ status: 'approved' }).eq('id', pending.id)
    return jsonResponse({ success: true, message: 'Deed approved and added to the active pool.', deed: { id: newDeed.id, deed_text: newDeed.deed_text, deed_text_long: null, category: newDeed.category, is_active: true } })
  }

  // ── POST /admin/pending-deeds/:id/reject ──────────────────────────────────
  const rejectMatch = matchPath('/admin/pending-deeds/:id/reject', path)
  if (method === 'POST' && rejectMatch) {
    requireAdmin(authUser)
    const { data: pending } = await supabase.from('pending_deeds')
      .select('id, status').eq('id', parseInt(rejectMatch.id)).maybeSingle()
    if (!pending) return errorResponse('Pending deed not found', 404)
    if (pending.status === 'rejected') return errorResponse('Already rejected', 400)
    await supabase.from('pending_deeds').update({ status: 'rejected' }).eq('id', pending.id)
    return jsonResponse({ success: true, message: 'Deed suggestion rejected.' })
  }

  // ── DELETE /admin/pending-deeds/:id ───────────────────────────────────────
  const pendingDeleteMatch = matchPath('/admin/pending-deeds/:id', path)
  if (method === 'DELETE' && pendingDeleteMatch) {
    requireAdmin(authUser)
    const { data: pending } = await supabase.from('pending_deeds')
      .select('id').eq('id', parseInt(pendingDeleteMatch.id)).maybeSingle()
    if (!pending) return errorResponse('Pending deed not found', 404)
    await supabase.from('pending_deeds').delete().eq('id', pending.id)
    return jsonResponse({ success: true })
  }

  return null
}
