// One-time backfill for the Impact Board (Issue #14): reconstruct historical
// completed_deeds rows from existing logs.
//   * quick actions  <- quick_deed_logs (tapped_at = completion time)
//   * bingo deeds     <- player_cards.completed_cells (deed per marked cell),
//                        completion time from cell_mark_log (latest 'mark') or
//                        the card's updated_at.
// Team + location are taken from the player's CURRENT record (historical values
// aren't stored anywhere). Safe to abort if completed_deeds already has rows.
//
// Run: node tools/backfill_completed_deeds.mjs   (reads .env for service role)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8').split('\n')
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim().replace(/\r$/, '')])
);
const URL = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function get(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function count(table) {
  const r = await fetch(`${URL}/rest/v1/${table}?select=id`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } });
  return parseInt((r.headers.get('content-range') || '*/0').split('/')[1] || '0', 10);
}
async function insert(rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const r = await fetch(`${URL}/rest/v1/completed_deeds`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(batch) });
    if (!r.ok) throw new Error(`INSERT batch -> ${r.status} ${await r.text()}`);
  }
}

const existing = await count('completed_deeds');
if (existing > 0) { console.log(`completed_deeds already has ${existing} rows — aborting (no double backfill).`); process.exit(0); }

// Reference maps
const users = await get('users?select=id,city,province_state,country_id&limit=100000');
const userMap = new Map(users.map((u) => [u.id, u]));
const countries = await get('countries?select=id,name&limit=100000');
const countryMap = new Map(countries.map((c) => [c.id, c.name]));
const teams = await get('team_members?select=user_id,team_id&limit=100000');
const teamMap = new Map(teams.map((t) => [t.user_id, t.team_id]));
const deeds = await get('good_deeds?select=id,category&limit=100000');
const deedCat = new Map(deeds.map((d) => [d.id, d.category]));

function loc(uid) {
  const u = userMap.get(uid) || {};
  return { city: u.city ?? null, province_state: u.province_state ?? null, country_id: u.country_id ?? null, country_name: u.country_id ? (countryMap.get(u.country_id) ?? null) : null };
}

const rows = [];

// 1) Quick actions
const qlogs = await get('quick_deed_logs?select=user_id,quick_deed_id,tapped_at&limit=100000');
for (const q of qlogs) {
  if (!userMap.has(q.user_id)) continue;
  rows.push({ player_id: q.user_id, team_id_at_completion: teamMap.get(q.user_id) ?? null, source_type: 'quick_action', quick_deed_id: q.quick_deed_id, category: null, ...loc(q.user_id), completed_at: q.tapped_at });
}
const quickCount = rows.length;

// 2) Bingo-card deeds — latest 'mark' time per (card, cell)
const marks = await get('cell_mark_log?select=card_id,cell_index,created_at,action&action=eq.mark&limit=100000');
const markTime = new Map();
for (const m of marks) {
  const k = `${m.card_id}|${m.cell_index}`;
  const prev = markTime.get(k);
  if (!prev || new Date(m.created_at) > new Date(prev)) markTime.set(k, m.created_at);
}
const cards = await get('player_cards?select=id,user_id,card_data,completed_cells,updated_at&limit=100000');
for (const card of cards) {
  let completed, cells;
  try { completed = JSON.parse(card.completed_cells || '[]'); } catch { completed = []; }
  try { cells = JSON.parse(card.card_data || '[]'); } catch { cells = []; }
  if (!Array.isArray(completed)) completed = [];
  for (const idx of completed) {
    const cell = cells[idx];
    const deedId = cell && cell.deed_id != null ? cell.deed_id : null;
    if (deedId == null) continue; // skip free/referral (no deed)
    rows.push({ player_id: card.user_id, team_id_at_completion: teamMap.get(card.user_id) ?? null, source_type: 'bingo_card', deed_id: deedId, category: deedCat.get(deedId) ?? (cell.category ?? null), card_id: card.id, cell_index: idx, ...loc(card.user_id), completed_at: markTime.get(`${card.id}|${idx}`) || card.updated_at || new Date().toISOString() });
  }
}
const cardCount = rows.length - quickCount;

console.log(`Prepared ${rows.length} rows: ${cardCount} bingo-card deeds + ${quickCount} quick actions.`);
await insert(rows);
const after = await count('completed_deeds');
console.log(`Done. completed_deeds now has ${after} rows.`);
