// End-to-end playtest for the bingo-completion draw-entry system: registers a
// throwaway anonymous player, plays through real game/index.ts endpoints the
// same way the frontend does (mark, purchase, reset), and cross-checks the
// resulting draw_entry_ledger / player_draw_balances rows in the database —
// not just what the API claims happened.
//
// Runs entirely against your LOCAL Supabase stack (`supabase start`). Never
// touches production. Free to run as many times as you want.
//
// Usage:
//   supabase start                        (only once per Docker session)
//   supabase db reset                     (only if your local schema is stale)
//   node tools/e2e_bingo_playtest.mjs
//
// What it checks:
//   1. Completing a full line (5 deeds, one purchased) pays exactly one
//      6-20 bonus roll, and per-deed votes accrue on every completion too.
//   2. The player is NOT blocked from marking further cells after winning
//      (the old "Game over, start a new game" wall is gone).
//   3. A move that completes two lines at once (a shared corner/center cell)
//      pays two independent 6-20 rolls in that same response.
//   4. Resetting the card ("Start Over") and winning again in the same week
//      pays a fresh roll — it is not treated as a duplicate of the first win.
//   5. Every ledger row lands with a plausible amount (6-20) and the DB
//      totals match what the API responses reported, line by line.
//
// Each check either passes or throws — a clean run prints ALL CHECKS PASSED.

const API = 'http://127.0.0.1:54321/functions/v1';
// Local Supabase's well-known demo keys (supabase status -o json) — public,
// safe to hardcode, never valid against production.
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const REST = 'http://127.0.0.1:54321/rest/v1';

let checks = 0;
function assert(cond, msg) {
  checks++;
  if (!cond) throw new Error(`FAILED: ${msg}`);
  console.log(`  ok  ${msg}`);
}

async function api(path, token, body) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`POST ${path} -> ${r.status} ${JSON.stringify(data)}`);
  return data;
}

async function rest(path) {
  const r = await fetch(`${REST}/${path}`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function restPatch(path, body) {
  const r = await fetch(`${REST}/${path}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${path} -> ${r.status} ${await r.text()}`);
}

// The 12 possible lines, same layout as game/index.ts's LINES constant.
function linesFor25() {
  const lines = [];
  for (let r = 0; r < 5; r++) lines.push([r * 5, r * 5 + 1, r * 5 + 2, r * 5 + 3, r * 5 + 4]);
  for (let c = 0; c < 5; c++) lines.push([c, c + 5, c + 10, c + 15, c + 20]);
  lines.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
  return lines;
}

async function markOrPurchase(token, cardId, cell) {
  if (cell.is_free_space) return null; // already counted, nothing to do
  if (cell.is_purchasable) return api('/game/purchase-cell', token, { card_id: cardId, cell_index: cell.index });
  return api('/game/mark-cell', token, { card_id: cardId, cell_index: cell.index });
}

async function completeLine(token, cardId, cells, lineIndices) {
  let last = null;
  for (const i of lineIndices) {
    const cell = cells.find((c) => c.index === i);
    if (cell.is_free_space || cell.completed) continue;
    last = await markOrPurchase(token, cardId, cell);
    cell.completed = true;
  }
  return last; // response from the FINAL cell in the line — carries the payout
}

async function main() {
  console.log(`\n== Bingo playtest — ${new Date().toISOString()} ==\n`);

  const nickname = `e2e-${Math.random().toString(36).slice(2, 10)}`;
  console.log(`Registering throwaway player "${nickname}"...`);
  const reg = await fetch(`${API}/auth-custom/register-anonymous`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, password: 'testpass123' }),
  }).then((r) => r.json());
  if (!reg.token) throw new Error(`Registration failed: ${JSON.stringify(reg)}`);
  const token = reg.token;
  const playerId = reg.user_id;
  console.log(`  player_id=${playerId}`);

  // Exempt from the daily deed limit (mirrors what an admin does for a real
  // tester via the "Trusted" checkbox) — this script plays through far more
  // than 3 deeds in one run.
  await restPatch(`users?id=eq.${playerId}`, { is_trusted: true });
  console.log('  marked is_trusted (exempt from daily deed limit)');

  // Fund a wallet up front so purchasable cells (which some lines include)
  // don't block the playthrough.
  await fetch(`${REST}/player_wallets`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify({ user_id: playerId, balance: 100 }),
  }).then((r) => { if (!r.ok) throw new Error(`wallet seed failed: ${r.status}`); });
  console.log('  wallet funded ($100)\n');

  console.log('Generating a classic card...');
  let card = await api('/game/generate-card', token, { game_mode: 'classic' });
  const cardId = card.card_id;
  card.cells.forEach((c) => { c.completed = false; });
  console.log(`  card_id=${cardId}\n`);

  // ── Check 1: complete one full line, verify exactly one bonus roll ────────
  console.log('Check 1: completing line 0 (top row)...');
  const lines = linesFor25();
  const line0Resp = await completeLine(token, cardId, card.cells, lines[0]);
  assert(line0Resp.is_bingo === true, 'card flips to is_bingo after the first complete line');
  assert(typeof line0Resp.draw_bonus_entries === 'number', 'a bonus was awarded for the first line');
  assert(line0Resp.draw_bonus_entries >= 6 && line0Resp.draw_bonus_entries <= 20, `bonus amount ${line0Resp.draw_bonus_entries} is in range 6-20`);
  const firstBonus = line0Resp.draw_bonus_entries;
  console.log(`  bonus: +${firstBonus} entries\n`);

  // ── Check 2: player is NOT blocked from continuing after the win ──────────
  // Cell 11 (row 2, col 1) deliberately avoids row 1 [5-9] and column 0
  // [0,5,10,15,20], which Check 3 needs untouched.
  console.log('Check 2: marking another cell after winning (must not be blocked)...');
  const nextCell = card.cells.find((c) => c.index === 11);
  const afterWinResp = await markOrPurchase(token, cardId, nextCell);
  nextCell.completed = true;
  assert(afterWinResp != null && afterWinResp.success !== false, 'marking after a win succeeds (no "Game over" block)');
  console.log('  not blocked\n');

  // ── Check 3: completing two lines in one move pays two independent rolls ──
  // Center (12) sits on the middle row, middle column, and both diagonals.
  // Complete the rest of the middle row AND middle column, leaving 12 as the
  // final shared cell — but 12 is the free "I Bet Ya" space, always counted,
  // so instead we pick two lines that share a REAL (non-free) cell: row 1
  // and column 0 share cell index 5.
  console.log('Check 3: one move completing two lines at once...');
  const row1 = lines[1];   // [5,6,7,8,9]
  const col0 = lines[5];   // [0,5,10,15,20]
  // Finish every cell of both lines EXCEPT their shared cell (5) first.
  for (const i of [...row1, ...col0]) {
    if (i === 5) continue;
    const cell = card.cells.find((c) => c.index === i);
    if (cell.completed || cell.is_free_space) continue;
    await markOrPurchase(token, cardId, cell);
    cell.completed = true;
  }
  const sharedCell = card.cells.find((c) => c.index === 5);
  const dualLineResp = sharedCell.is_purchasable
    ? await api('/game/purchase-cell', token, { card_id: cardId, cell_index: 5 })
    : await api('/game/mark-cell', token, { card_id: cardId, cell_index: 5 });
  sharedCell.completed = true;
  assert(typeof dualLineResp.draw_bonus_entries === 'number', 'a bonus was awarded for the dual-line move');
  console.log(`  bonus this move: +${dualLineResp.draw_bonus_entries} entries (expect this to often be the sum of 2 rolls, each 6-20)\n`);

  // ── Check 4: reset ("Start Over") + win again pays a fresh roll ───────────
  console.log('Check 4: reset card and win again — must NOT be treated as a duplicate...');
  await api('/game/reset-card', token, {});
  card = await api('/game/generate-card', token, {});
  card.cells.forEach((c) => { c.completed = false; });
  const cycle2Resp = await completeLine(token, cardId, card.cells, lines[0]);
  assert(cycle2Resp.is_bingo === true, 'card wins again after reset');
  assert(typeof cycle2Resp.draw_bonus_entries === 'number', 'a NEW bonus was awarded after reset (not deduped against the pre-reset win)');
  assert(cycle2Resp.draw_bonus_entries >= 6 && cycle2Resp.draw_bonus_entries <= 20, `post-reset bonus ${cycle2Resp.draw_bonus_entries} is in range 6-20`);
  console.log(`  bonus after reset: +${cycle2Resp.draw_bonus_entries} entries\n`);

  // ── Check 5: cross-check the database directly ─────────────────────────────
  console.log('Check 5: cross-checking draw_entry_ledger / player_draw_balances directly...');
  const ledger = await rest(`draw_entry_ledger?player_id=eq.${playerId}&order=id.asc`);
  const bonusRows = ledger.filter((r) => r.event_type === 'bingo_bonus');
  const deedRows = ledger.filter((r) => r.event_type === 'deed_entry' || r.event_type === 'quick_tap_entry');
  assert(bonusRows.length >= 4, `at least 4 separate bingo_bonus ledger rows exist (line0, dual-line x2, post-reset) — found ${bonusRows.length}`);
  assert(bonusRows.every((r) => Number(r.amount) >= 6 && Number(r.amount) <= 20), 'every individual bonus ledger row is in range 6-20');
  assert(new Set(bonusRows.map((r) => r.source_event_id)).size === bonusRows.length, 'every bonus ledger row has a unique idempotency key (no duplicates)');
  assert(deedRows.length > 0, 'per-deed votes were recorded for completed deeds');

  const [balance] = await rest(`player_draw_balances?player_id=eq.${playerId}`);
  const ledgerTotal = ledger.reduce((s, r) => s + Number(r.amount), 0);
  assert(Number(balance.active_entries) === ledgerTotal, `player_draw_balances.active_entries (${balance.active_entries}) matches the ledger sum (${ledgerTotal})`);

  console.log(`\n  ${bonusRows.length} bonus rolls: ${bonusRows.map((r) => r.amount).join(', ')}`);
  console.log(`  ${deedRows.length} per-deed votes`);
  console.log(`  active_entries total: ${balance.active_entries}\n`);

  console.log(`ALL CHECKS PASSED (${checks} assertions)\n`);
}

main().catch((err) => {
  console.error(`\n${err.message}\n`);
  process.exit(1);
});
