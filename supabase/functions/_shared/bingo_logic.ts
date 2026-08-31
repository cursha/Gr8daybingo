// =============================================================================
// Pure bingo win/pattern logic — NO external imports so it is trivially
// unit-testable. Extracted out of game/index.ts, which imports from here.
// =============================================================================

// The 12 possible bingo lines on a 5x5 card: 5 rows, 5 columns, 2 diagonals.
// Shared by checkBingo (win_condition threshold check) and
// completedLineIndices (feeds the One Line / Two Lines scoring patterns —
// see newlySatisfiedPatterns/awardBingoPatterns).
export const LINES: number[][] = (() => {
  const lines: number[][] = []
  for (let r = 0; r < 5; r++) lines.push([r * 5, r * 5 + 1, r * 5 + 2, r * 5 + 3, r * 5 + 4])
  for (let c = 0; c < 5; c++) lines.push([c, c + 5, c + 10, c + 15, c + 20])
  lines.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20])
  return lines
})()

/** Indices (0-11) of LINES that are fully satisfied by `completed`. A
 *  "bingo" for bonus-payout purposes is any of these — independent of
 *  whichever win_condition is configured (that only gates the one-time win
 *  banner/email, via checkBingo below). */
export function completedLineIndices(completed: number[]): number[] {
  const s = new Set(completed)
  const result: number[] = []
  LINES.forEach((line, i) => { if (line.every((x) => s.has(x))) result.push(i) })
  return result
}

export function checkBingo(completed: number[], winCondition: string): boolean {
  const s = new Set(completed)
  const sub = (line: number[]) => line.every((x) => s.has(x))
  switch (winCondition) {
    case 'one_line': return LINES.some(sub)
    case 'two_lines': return LINES.filter(sub).length >= 2
    case 'four_corners': return sub([0, 4, 20, 24])
    case 'one_line_or_corners': return LINES.some(sub) || sub([0, 4, 20, 24])
    case 'x_pattern': return sub([0, 6, 12, 18, 24, 4, 8, 16, 20])
    case 'around_the_edges': return sub([0,1,2,3,4,5,9,10,14,15,19,20,21,22,23,24])
    case 'fill_card': return [...Array(25).keys()].every((x) => s.has(x))
    default: return false
  }
}

// ── Scoring table (Section 8 admin feature) ─────────────────────────────────
// Six named milestones, independent of whichever win_condition is active —
// a card can hit several of these on the way to (or past) its official win.
// Each pays once per card, the first time it's reached: bonus = the number
// of REAL deed squares in that pattern x a uniform random roll from 1 to 4
// (see awardPatternBonus in _shared/draw.ts, where the roll happens).
// "Real deed squares" excludes anything the player didn't actually do a
// deed for — purchased cells, referral-free cells, and the free centre
// space all still count toward WINNING (they're part of `allCompleted`,
// same as checkBingo), but none of them count toward the BONUS math, so a
// pattern leaned on shortcuts pays less than one earned the hard way.

// Nominal (all-cells) square counts — used only for the admin reference
// table, since the real payout varies per card based on which cells in the
// pattern were actually earned via a deed vs. purchased/free/referral.
export const PATTERN_NOMINAL_SQUARES: Record<string, number> = {
  one_line: 5, two_lines: 10, four_corners: 4, x_pattern: 9, around_the_edges: 16, fill_card: 25,
}
export const ALL_SCORING_PATTERNS = Object.keys(PATTERN_NOMINAL_SQUARES)

export const PATTERN_FIXED_CELLS: Record<string, number[]> = {
  four_corners: [0, 4, 20, 24],
  x_pattern: [0, 6, 12, 18, 24, 4, 8, 16, 20],
  around_the_edges: [0, 1, 2, 3, 4, 5, 9, 10, 14, 15, 19, 20, 21, 22, 23, 24],
  fill_card: Array.from({ length: 25 }, (_, i) => i),
}

export function isPatternComplete(pattern: string, lineCount: number, completedSet: Set<number>): boolean {
  if (pattern === 'one_line') return lineCount >= 1
  if (pattern === 'two_lines') return lineCount >= 2
  return (PATTERN_FIXED_CELLS[pattern] ?? []).every((x) => completedSet.has(x))
}

/** Real (deed-only) square count for a satisfied pattern. `completedDeeds`
 *  is the player's actual deed-marked cells (never purchased/referral/free
 *  — those all live in `allCompleted` but never in `completed`). For the
 *  two line-based patterns, which specific line(s) qualify isn't tracked,
 *  so this picks whichever currently-satisfied line(s) have the most real
 *  deed squares — the most generous reasonable reading, not an exact
 *  attribution (the existing per-line system never deduplicated overlap
 *  between two lines either, so this stays at the same precision level). */
export function realSquaresForPattern(pattern: string, completedDeeds: number[], allCompleted: number[]): number {
  const completedDeedSet = new Set(completedDeeds)
  if (pattern === 'one_line' || pattern === 'two_lines') {
    const allCompletedSet = new Set(allCompleted)
    const realCounts = LINES
      .filter((line) => line.every((c) => allCompletedSet.has(c)))
      .map((line) => line.filter((c) => completedDeedSet.has(c)).length)
      .sort((a, b) => b - a)
    return pattern === 'one_line'
      ? (realCounts[0] ?? 0)
      : (realCounts[0] ?? 0) + (realCounts[1] ?? 0)
  }
  return (PATTERN_FIXED_CELLS[pattern] ?? []).filter((c) => completedDeedSet.has(c)).length
}

/** Which of the 6 scoring patterns are satisfied by `allCompleted` but
 *  aren't in `existingPatterns` yet, with each one's real bonus square
 *  count already computed — called up front so the caller can persist the
 *  updated pattern list in the same DB write that marks the cell, before
 *  the actual awarding (a separate async/RPC step) happens. */
export function newlySatisfiedPatterns(
  completedDeeds: number[], allCompleted: number[], existingPatterns: string[],
): { pattern: string; squares: number }[] {
  const completedSet = new Set(allCompleted)
  const lineCount = completedLineIndices(allCompleted).length
  const result: { pattern: string; squares: number }[] = []
  for (const pattern of ALL_SCORING_PATTERNS) {
    if (existingPatterns.includes(pattern)) continue
    if (!isPatternComplete(pattern, lineCount, completedSet)) continue
    result.push({ pattern, squares: realSquaresForPattern(pattern, completedDeeds, allCompleted) })
  }
  return result
}
