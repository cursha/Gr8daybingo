// =============================================================================
// Pure-logic tests for bingo win detection and the scoring-pattern system.
// Runs under Deno (`deno test`) OR Node (`npx tsx tests/bingo_logic.test.ts`).
// This is the win-check and pattern-bonus math the security/readiness audit
// flagged as having no automated coverage — a future change to card
// generation or the scoring table should break one of these, not silently
// change who wins or how much a bonus pays.
// =============================================================================
import {
  checkBingo, completedLineIndices, isPatternComplete,
  realSquaresForPattern, newlySatisfiedPatterns,
} from '../functions/_shared/bingo_logic.ts'

// Tiny assert + runner so we don't depend on a framework (matches draw_logic.test.ts).
let passed = 0, failed = 0
const tests: Array<[string, () => void]> = []
const test = (name: string, fn: () => void) => tests.push([name, fn])
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg) }
function eq<T>(a: T, b: T, msg: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`) }

// Row/column/diagonal indices, spelled out for readability in the cases below.
const ROW0 = [0, 1, 2, 3, 4]
const ROW1 = [5, 6, 7, 8, 9]
const COL0 = [0, 5, 10, 15, 20]
const COL1 = [1, 6, 11, 16, 21]
const DIAG1 = [0, 6, 12, 18, 24]
const DIAG2 = [4, 8, 12, 16, 20]
const CORNERS = [0, 4, 20, 24]
const EDGES = [0, 1, 2, 3, 4, 5, 9, 10, 14, 15, 19, 20, 21, 22, 23, 24]
const ALL_25 = Array.from({ length: 25 }, (_, i) => i)

// ── checkBingo: one win_condition at a time ───────────────────────────────────
test('one_line: a full row wins, a near-full row does not', () => {
  eq(checkBingo(ROW0, 'one_line'), true, 'full row0 wins')
  eq(checkBingo(ROW0.slice(0, 4), 'one_line'), false, '4-of-5 does not win')
})

test('two_lines: needs two full lines, not one', () => {
  eq(checkBingo([...ROW0, ...ROW1], 'two_lines'), true, 'two full rows win')
  eq(checkBingo(ROW0, 'two_lines'), false, 'one full row is not enough')
})

test('four_corners: exact corners only', () => {
  eq(checkBingo(CORNERS, 'four_corners'), true, 'all 4 corners win')
  eq(checkBingo([0, 4, 20], 'four_corners'), false, '3 of 4 corners do not win')
})

test('one_line_or_corners: either a line or the corners counts', () => {
  eq(checkBingo(CORNERS, 'one_line_or_corners'), true, 'corners alone win')
  eq(checkBingo(COL1, 'one_line_or_corners'), true, 'a full line with no corners still wins')
  eq(checkBingo([0, 4, 20], 'one_line_or_corners'), false, 'neither a full line nor full corners')
})

test('x_pattern: both diagonals, sharing the centre cell', () => {
  const xCells = [...new Set([...DIAG1, ...DIAG2])]
  eq(checkBingo(xCells, 'x_pattern'), true, 'both diagonals win')
  eq(checkBingo(DIAG1, 'x_pattern'), false, 'one diagonal alone does not win')
})

test('around_the_edges: the full border, nothing less', () => {
  eq(checkBingo(EDGES, 'around_the_edges'), true, 'full border wins')
  eq(checkBingo(EDGES.slice(0, -1), 'around_the_edges'), false, '15 of 16 border cells do not win')
})

test('fill_card: every one of the 25 cells', () => {
  eq(checkBingo(ALL_25, 'fill_card'), true, 'all 25 cells win')
  eq(checkBingo(ALL_25.slice(0, 24), 'fill_card'), false, '24 of 25 cells do not win')
})

test('unknown win_condition never wins', () => {
  eq(checkBingo(ALL_25, 'not_a_real_condition'), false, 'unrecognized condition is always false')
})

// ── completedLineIndices ───────────────────────────────────────────────────────
test('completedLineIndices finds exactly the lines that are actually full', () => {
  // ROW0 ∪ COL0 overlap at cell 0 — should report both, and nothing else.
  const result = completedLineIndices([...new Set([...ROW0, ...COL0])])
  eq(result.sort(), [0, 5].sort(), 'row0 (index 0) and col0 (index 5) both complete')
})

test('completedLineIndices reports nothing when no line is full', () => {
  eq(completedLineIndices([0, 1, 2, 6, 7]), [], 'scattered cells complete no line')
})

// ── isPatternComplete ────────────────────────────────────────────────────────
test('isPatternComplete: one_line/two_lines read off the line count', () => {
  eq(isPatternComplete('one_line', 0, new Set()), false, '0 lines: one_line not satisfied')
  eq(isPatternComplete('one_line', 1, new Set()), true, '1 line: one_line satisfied')
  eq(isPatternComplete('two_lines', 1, new Set()), false, '1 line: two_lines not satisfied')
  eq(isPatternComplete('two_lines', 2, new Set()), true, '2 lines: two_lines satisfied')
})

test('isPatternComplete: fixed-cell patterns check the actual cells', () => {
  eq(isPatternComplete('four_corners', 0, new Set(CORNERS)), true, 'all corners present')
  eq(isPatternComplete('four_corners', 0, new Set([0, 4, 20])), false, 'missing one corner')
})

// ── realSquaresForPattern: only deed-earned cells count toward the bonus ──────
test('realSquaresForPattern: four_corners counts only the real (deed) corners', () => {
  // Card is won via all 4 corners, but only 2 were earned by an actual deed —
  // the other 2 were purchased/free. The bonus should reflect 2, not 4.
  const squares = realSquaresForPattern('four_corners', [0, 4], CORNERS)
  eq(squares, 2, 'only the 2 deed-earned corners count')
})

test('realSquaresForPattern: one_line picks the best-earned qualifying line', () => {
  // Two lines are both fully complete (via allCompleted), but only ROW0 has
  // any real deed squares — one_line should credit that one, not ROW1.
  const allCompleted = [...ROW0, ...ROW1]
  const completedDeeds = [0, 1, 2] // 3 real cells, all inside ROW0
  eq(realSquaresForPattern('one_line', completedDeeds, allCompleted), 3, 'credits the 3 real cells in ROW0')
})

test('realSquaresForPattern: two_lines sums the two best lines\' real cells', () => {
  const allCompleted = [...ROW0, ...ROW1]
  const completedDeeds = [0, 1, 5, 6, 7] // 2 real in ROW0, 3 real in ROW1
  eq(realSquaresForPattern('two_lines', completedDeeds, allCompleted), 5, 'sums 2 + 3 real cells across both lines')
})

// ── newlySatisfiedPatterns: the end-to-end function mark-cell/dare-ya call ────
test('newlySatisfiedPatterns reports a freshly-completed pattern with its real square count', () => {
  const completedDeeds = [0, 4] // earned 2 of the 4 corners via real deeds
  const allCompleted = CORNERS // all 4 corners are marked (2 purchased/free)
  const result = newlySatisfiedPatterns(completedDeeds, allCompleted, [])
  const fourCorners = result.find((r) => r.pattern === 'four_corners')
  assert(fourCorners !== undefined, 'four_corners should be newly satisfied')
  eq(fourCorners!.squares, 2, 'bonus reflects only the 2 real deed corners')
})

test('newlySatisfiedPatterns never re-reports a pattern already in existingPatterns', () => {
  const result = newlySatisfiedPatterns([0, 4, 20, 24], CORNERS, ['four_corners'])
  eq(result.find((r) => r.pattern === 'four_corners'), undefined, 'already-awarded pattern is skipped')
})

test('newlySatisfiedPatterns reports nothing when nothing new is complete', () => {
  const result = newlySatisfiedPatterns([0, 1], [0, 1], [])
  eq(result, [], 'no pattern is satisfied yet')
})

test('newlySatisfiedPatterns can report multiple patterns at once', () => {
  // Filling the whole card completes every pattern simultaneously.
  const result = newlySatisfiedPatterns(ALL_25, ALL_25, [])
  const patterns = result.map((r) => r.pattern).sort()
  eq(patterns, ['around_the_edges', 'fill_card', 'four_corners', 'one_line', 'two_lines', 'x_pattern'].sort(), 'all 6 patterns satisfied at once')
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
  Deno.test('all pure bingo-logic assertions pass', () => { if (failed > 0) throw new Error(`${failed} failing`) })
}
if (typeof process !== 'undefined' && failed > 0) (globalThis as { process?: { exitCode?: number } }).process!.exitCode = 1
