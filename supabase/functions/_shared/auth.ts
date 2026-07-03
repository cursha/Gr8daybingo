import * as jose from 'npm:jose@5'

export interface JWTPayload {
  sub: string
  email: string
  role: string
  name?: string
  last_login?: string
}

function getSecret(): Uint8Array {
  const key = Deno.env.get('JWT_SECRET_KEY') ?? 'changeme-set-JWT_SECRET_KEY-in-env'
  return new TextEncoder().encode(key)
}

function getAlgorithm(): string {
  return Deno.env.get('JWT_ALGORITHM') ?? 'HS256'
}

function getExpireSeconds(): number {
  // Whatever JWT_EXPIRE_MINUTES is set to in the live secrets, never let a
  // session expire in under a day — a too-low value there is exactly what
  // was silently logging players out. Combined with the sliding refresh in
  // GET /me, this makes the configured value irrelevant to that failure mode.
  const MIN_MINUTES = 24 * 60
  const DEFAULT_MINUTES = 7 * 24 * 60
  const configured = parseInt(Deno.env.get('JWT_EXPIRE_MINUTES') ?? String(DEFAULT_MINUTES))
  const minutes = Number.isFinite(configured) ? Math.max(configured, MIN_MINUTES) : DEFAULT_MINUTES
  return minutes * 60
}

export async function createAccessToken(
  claims: Record<string, unknown>,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new jose.SignJWT(claims)
    .setProtectedHeader({ alg: getAlgorithm() })
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + getExpireSeconds())
    .sign(getSecret())
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jose.jwtVerify(token, getSecret(), {
    algorithms: [getAlgorithm()],
  })
  return payload as unknown as JWTPayload
}

export async function getAuthUser(req: Request): Promise<JWTPayload | null> {
  const auth =
    req.headers.get('Authorization') ?? req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  try {
    return await verifyToken(auth.slice(7))
  } catch {
    return null
  }
}

export function requireAuth(user: JWTPayload | null): JWTPayload {
  if (!user)
    throw { status: 401, detail: 'Authentication credentials were not provided' }
  return user
}

export function requireAdmin(user: JWTPayload | null): JWTPayload {
  const u = requireAuth(user)
  if (u.role !== 'admin') throw { status: 403, detail: 'Admin access required' }
  return u
}
