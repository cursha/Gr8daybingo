// Mint a short-lived admin JWT (HS256 with JWT_SECRET_KEY) and call the one-time
// /admin/backfill-completed-deeds endpoint. Authorized maintenance only.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8').split('\n')
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim().replace(/\r$/, '')])
);
const SECRET = env.JWT_SECRET_KEY;
const ANON = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const URL = env.SUPABASE_URL;

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = b64({ alg: 'HS256', typ: 'JWT' });
const payload = b64({ sub: 'backfill-maintenance', email: 'admin@havagr8day.com', role: 'admin', iat: now, nbf: now, exp: now + 600 });
const sig = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
const token = `${header}.${payload}.${sig}`;

const r = await fetch(`${URL}/functions/v1/game/admin/backfill-completed-deeds`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: '{}',
});
console.log('HTTP', r.status);
console.log(await r.text());
