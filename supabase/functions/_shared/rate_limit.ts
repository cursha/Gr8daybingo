import { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export interface RateLimitCheck {
  allowed: boolean
  message?: string
}

/** Is this bucket currently locked out? Call before doing any real work. */
export async function checkRateLimit(
  supabase: SupabaseClient,
  bucketKey: string,
): Promise<RateLimitCheck> {
  const { data: row } = await supabase
    .from('rate_limits').select('locked_until').eq('bucket_key', bucketKey).maybeSingle()
  if (row?.locked_until && new Date(row.locked_until) > new Date()) {
    return { allowed: false, message: 'Too many attempts. Please try again later.' }
  }
  return { allowed: true }
}

/**
 * Counts one attempt against a bucket (a failed login, or any signup
 * attempt) within a sliding window, locking the bucket out once
 * maxAttempts is reached within windowMinutes. The window resets itself
 * automatically once it's stale — nothing needs to clean this table up.
 */
export async function recordAttempt(
  supabase: SupabaseClient,
  bucketKey: string,
  opts: { maxAttempts: number; windowMinutes: number; lockMinutes: number },
): Promise<void> {
  const now = new Date()
  const { data: row } = await supabase
    .from('rate_limits').select('*').eq('bucket_key', bucketKey).maybeSingle()

  const windowExpired =
    !row || new Date(row.window_start).getTime() < now.getTime() - opts.windowMinutes * 60 * 1000
  const newCount = windowExpired ? 1 : (row.attempt_count ?? 0) + 1
  const lockedUntil =
    newCount >= opts.maxAttempts ? new Date(now.getTime() + opts.lockMinutes * 60 * 1000).toISOString() : null

  await supabase.from('rate_limits').upsert(
    {
      bucket_key: bucketKey,
      attempt_count: newCount,
      window_start: windowExpired ? now.toISOString() : row.window_start,
      locked_until: lockedUntil,
      updated_at: now.toISOString(),
    },
    { onConflict: 'bucket_key' },
  )
}

/** Call on a successful login so a prior string of failures doesn't linger. */
export async function clearRateLimit(supabase: SupabaseClient, bucketKey: string): Promise<void> {
  await supabase.from('rate_limits').delete().eq('bucket_key', bucketKey)
}

/** Best-effort client IP from the headers Supabase's gateway sets. */
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}
