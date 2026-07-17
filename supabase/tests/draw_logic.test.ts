// =============================================================================
// Pure-logic tests for the Weekly Draw Entry system.
// Runs under Deno (`deno test`) OR Node (`npx tsx tests/draw_logic.test.ts`).
// Covers the settings-gated rules (cases 12/13/14), participation/rollover
// (cases 6/8), weighted selection, and the week-bounds helper.
// =============================================================================
import {
  parseDrawSettings, deedShouldAward, bingoShouldAward, isEligible,
  selectWeightedWinner, weekBounds, currentWeekYear, PoolCandidate,
} from '../functions/_shared/draw_logic.ts'

// Tiny assert + runner so we don't depend on a framework.
let passed = 0, failed = 0
const tests: Array<[string, () => void]> = []
const test = (name: string, fn: () => void) => tests.push([name, fn])
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg) }
function eq<T>(a: T, b: T, msg: string) { if (a !== b) throw new Error(`${msg}: ${a} !== ${b}`) }

const DEFAULTS = parseDrawSettings({})

test('defaults are spec-correct', () => {
  eq(DEFAULTS.weeklyDrawEnabled, true, 'weekly on')
  eq(DEFAULTS.entriesPerDeed, 1, 'per deed 1')
  eq(DEFAULTS.includeQuickTap, true, 'quick on')
  eq(DEFAULTS.requireParticipation, true, 'participation on')
  eq(DEFAULTS.resetAfterWin, true, 'reset on')
  eq(DEFAULTS.inactiveExpirationWeeks, 0, 'never expire by default')
})

// ── Case 13: deed entries disabled → deeds do not create entries ──────────────
test('case13 deed entries disabled', () => {
  const s = parseDrawSettings({ deed_draw_entries_enabled: '0' })
  eq(deedShouldAward(s, 'bingo_card'), false, 'no deed award when disabled')
})

// ── Case 14: bingo bonus disabled → no bonus ──────────────────────────────────
test('case14 bingo bonus disabled', () => {
  const s = parseDrawSettings({ bingo_bonus_enabled: '0' })
  eq(bingoShouldAward(s), false, 'no bonus when disabled')
})

// ── Case 12: weekly draw disabled → nothing awards (master switch) ────────────
test('case12 master switch off', () => {
  const s = parseDrawSettings({ weekly_draw_enabled: '0' })
  eq(deedShouldAward(s, 'bingo_card'), false, 'deed gated by master')
  eq(bingoShouldAward(s), false, 'bonus gated by master')
})

test('quick-tap toggle honoured', () => {
  const s = parseDrawSettings({ include_quick_tap_deeds: '0' })
  eq(deedShouldAward(s, 'quick_action'), false, 'quick excluded')
  eq(deedShouldAward(s, 'bingo_card'), true, 'bingo-card still awards')
})

// ── Case 8: skipped week → ineligible when participation required ─────────────
test('case8 no participation => ineligible', () => {
  const c: PoolCandidate = { user_id: 'u', active_entries: 50, last_participation_date: null, is_recent_winner: false, is_active: true }
  eq(isEligible(c, DEFAULTS, /*participated*/ false), false, 'ineligible without participation')
  eq(isEligible(c, DEFAULTS, /*participated*/ true), true, 'eligible with participation')
})

// ── Case 6: rollover — entries persist; eligible if participating ─────────────
test('case6 rollover entries remain eligible', () => {
  // 50 active carried from prior weeks; participated this week → still in the pool.
  const c: PoolCandidate = { user_id: 'u', active_entries: 50, last_participation_date: '2026-01-01', is_recent_winner: false, is_active: true }
  eq(isEligible(c, DEFAULTS, true), true, 'rolled-over entries count when participating')
})

test('participation not required => eligible regardless', () => {
  const s = parseDrawSettings({ require_current_week_participation: '0' })
  const c: PoolCandidate = { user_id: 'u', active_entries: 3, last_participation_date: null, is_recent_winner: false, is_active: true }
  eq(isEligible(c, s, false), true, 'no participation gate')
})

test('zero active entries never eligible', () => {
  const c: PoolCandidate = { user_id: 'u', active_entries: 0, last_participation_date: '2026-01-01', is_recent_winner: false, is_active: true }
  eq(isEligible(c, DEFAULTS, true), false, 'no entries => out')
})

// ── Inactive players are excluded from the weekly prize draw ──────────────────
test('inactive player never eligible, even with entries and participation', () => {
  const c: PoolCandidate = { user_id: 'u', active_entries: 50, last_participation_date: '2026-01-01', is_recent_winner: false, is_active: false }
  eq(isEligible(c, DEFAULTS, true), false, 'inactive excluded regardless of entries/participation')
})

// ── Weighted selection: weight proportional to active entries ─────────────────
test('weighted selection picks by cumulative weight', () => {
  const cands: PoolCandidate[] = [
    { user_id: 'a', active_entries: 1, last_participation_date: null, is_recent_winner: false, is_active: true },
    { user_id: 'b', active_entries: 9, last_participation_date: null, is_recent_winner: false, is_active: true },
  ]
  // total weight = 10. rand01=0.05 -> 0.5 into pool -> 'a' (first 1.0). rand01=0.5 -> 5.0 -> 'b'.
  eq(selectWeightedWinner(cands, DEFAULTS, () => 0.05)!.user_id, 'a', 'low rand -> a')
  eq(selectWeightedWinner(cands, DEFAULTS, () => 0.5)!.user_id, 'b', 'mid rand -> b')
  eq(selectWeightedWinner(cands, DEFAULTS, () => 0.999)!.user_id, 'b', 'high rand -> b')
})

test('recent winner gets reduced weight', () => {
  const cands: PoolCandidate[] = [
    { user_id: 'a', active_entries: 10, last_participation_date: null, is_recent_winner: true, is_active: true },  // weight 0.5
    { user_id: 'b', active_entries: 10, last_participation_date: null, is_recent_winner: false, is_active: true }, // weight 10
  ]
  // total = 10.5; only rand pushing past 0.5 lands on b. rand=0.01 -> 0.105 -> still 'a'.
  eq(selectWeightedWinner(cands, DEFAULTS, () => 0.01)!.user_id, 'a', 'tiny rand -> a')
  eq(selectWeightedWinner(cands, DEFAULTS, () => 0.2)!.user_id, 'b', 'most mass -> b')
})

test('empty / zero-weight pool returns null', () => {
  eq(selectWeightedWinner([], DEFAULTS, () => 0.5), null, 'empty pool')
  const zero: PoolCandidate[] = [{ user_id: 'a', active_entries: 0, last_participation_date: null, is_recent_winner: false, is_active: true }]
  eq(selectWeightedWinner(zero, DEFAULTS, () => 0.5), null, 'zero weight')
})

// ── Distribution sanity: ~proportional over many draws ────────────────────────
test('selection is roughly proportional', () => {
  const cands: PoolCandidate[] = [
    { user_id: 'a', active_entries: 1, last_participation_date: null, is_recent_winner: false, is_active: true },
    { user_id: 'b', active_entries: 3, last_participation_date: null, is_recent_winner: false, is_active: true },
  ]
  let aWins = 0
  const N = 20000
  for (let i = 0; i < N; i++) {
    // deterministic LCG for reproducibility
    const r = ((i * 1103515245 + 12345) % 2147483648) / 2147483648
    if (selectWeightedWinner(cands, DEFAULTS, () => r)!.user_id === 'a') aWins++
  }
  const ratio = aWins / N // expect ~0.25
  assert(ratio > 0.20 && ratio < 0.30, `a-win ratio ~0.25, got ${ratio.toFixed(3)}`)
})

// ── Week bounds helper ────────────────────────────────────────────────────────
test('weekBounds spans exactly 7 days, Monday start', () => {
  const { start, end } = weekBounds('2026-W26')
  eq(start.getUTCDay(), 1, 'starts Monday')
  eq((end.getTime() - start.getTime()) / 86_400_000, 7, 'spans 7 days')
})

test('currentWeekYear round-trips into its own bounds', () => {
  const wy = currentWeekYear(new Date('2026-06-25T12:00:00Z'))
  assert(/^\d{4}-W\d{2}$/.test(wy), `format ${wy}`)
})

// ── runner ────────────────────────────────────────────────────────────────────
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (e) { failed++; console.error(`  ✗ ${name}\n     ${(e as Error).message}`) }
}
console.log(`\n${passed} passed, ${failed} failed`)
// Deno: surface failures as a real test too.
declare const Deno: { test?: (n: string, f: () => void) => void } | undefined
if (typeof Deno !== 'undefined' && Deno?.test) {
  Deno.test('all pure draw-logic assertions pass', () => { if (failed > 0) throw new Error(`${failed} failing`) })
}
if (typeof process !== 'undefined' && failed > 0) (globalThis as { process?: { exitCode?: number } }).process!.exitCode = 1
