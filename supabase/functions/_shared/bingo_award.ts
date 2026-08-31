// =============================================================================
// Paying out newly-satisfied scoring patterns + the one-time bingo-win email.
// Shared by mark-cell, the I Dare Ya routes, and unmark/void-cell reversal —
// anywhere a card's completed_cells changes and might newly satisfy (or
// un-satisfy) a scoring pattern.
// =============================================================================
import { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { getDrawSettings, awardPatternBonus } from './draw.ts'
import { sendEmail, bingoWinEmail } from './email.ts'

const WIN_LABELS: Record<string, string> = {
  one_line: 'One Line', two_lines: 'Two Lines', four_corners: 'Four Corners',
  one_line_or_corners: 'One Line or Four Corners',
  x_pattern: 'X Pattern', around_the_edges: 'Around the Edges', fill_card: 'Fill the Card',
}
export function winLabel(cond: string): string { return WIN_LABELS[cond] ?? cond }

/** Awards each already-computed newly-satisfied pattern (see
 *  newlySatisfiedPatterns) — squares x a fresh 1-PATTERN_BONUS_MAX_MULTIPLIER
 *  roll per pattern, each pattern paid once ever per card — and sends the
 *  one-time "you've won" email the first time the configured win_condition
 *  is satisfied (independent of which scoring patterns have paid out).
 *  Idempotent per (card, pattern): a retried call may roll again, but only
 *  the first roll that actually inserts a new ledger row for that pattern
 *  is ever applied. Returns the total newly-awarded entries (0 if nothing
 *  new this action). Caller persists the updated bonus_patterns_awarded
 *  list onto the card row. */
export async function awardBingoPatterns(
  supabase: SupabaseClient,
  opts: {
    playerId: string
    cardId: number
    weekYear: string
    newPatterns: { pattern: string; squares: number }[]
    winCondition: string
    wasAlreadyBingo: boolean
    isBingoNow: boolean
    userEmail?: string | null
    userName?: string | null
  },
): Promise<number> {
  let total = 0
  if (opts.newPatterns.length > 0) {
    const drawSettings = await getDrawSettings(supabase)
    for (const { pattern, squares } of opts.newPatterns) {
      const bonus = await awardPatternBonus(supabase, {
        playerId: opts.playerId, cardId: opts.cardId, weekYear: opts.weekYear,
        pattern, squares, settings: drawSettings,
      })
      if (bonus != null) total += bonus
    }
  }
  if (opts.isBingoNow && !opts.wasAlreadyBingo && opts.userEmail) {
    const tpl = bingoWinEmail(opts.userName ?? null, winLabel(opts.winCondition))
    await sendEmail({ to: opts.userEmail, subject: tpl.subject, html: tpl.html })
  }
  return total
}
