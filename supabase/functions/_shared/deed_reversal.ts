// =============================================================================
// Reversing a single completed cell — the ballot (draw entry) it earned, and
// any scoring-pattern bonus that no longer holds once it's gone. Shared by
// the player-facing /unmark-cell and the admin /admin/void-cell routes, so
// "the mark is removed" always means "the ballot is removed too," from
// whichever direction that happens. Mirrors the logic /admin/reverse-deed
// already used (that route keeps its own copy — same effect, different
// entry point: it starts from a completed_deed_id instead of a card+cell).
// =============================================================================
import { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { Cell, parseJsonArr, parseJsonStrArr, freeSpaceIndices } from './card_helpers.ts'
import { checkBingo, completedLineIndices, isPatternComplete } from './bingo_logic.ts'
import { reverseDeedEntry, reversePatternBonus } from './draw.ts'

export interface CellReversalResult {
  ok: boolean
  updatedCompleted: number[]
  isBingo: boolean
  deedReversed: boolean
  bingoReversed: boolean
}

/** Removes one cell from a card's completed_cells, and takes back everything
 *  that cell earned: its draw entry, and any scoring-pattern bonus that was
 *  paid but no longer holds without it. The player_cards write is itself
 *  the concurrency-guarded step (same pattern as mark-cell): `ok: false`
 *  means the card changed under us and nothing was written — the caller
 *  should surface that as a 409, not retry silently. */
export async function reverseCellCompletion(
  supabase: SupabaseClient,
  card: {
    id: number
    card_data: string
    completed_cells: string | null
    purchased_cells: string | null
    referral_cells: string | null
    win_condition: string
    bonus_patterns_awarded: string | null
    is_bingo: boolean
    updated_at: string
  },
  cellIndex: number,
  actorId: string,
  reason: string,
): Promise<CellReversalResult> {
  const cells: Cell[] = JSON.parse(card.card_data)
  const completed = parseJsonArr(card.completed_cells)
  const updatedCompleted = completed.filter((i: number) => i !== cellIndex)
  const purchased = parseJsonArr(card.purchased_cells)
  const referral = parseJsonArr(card.referral_cells)
  const allCompleted = [...new Set([...updatedCompleted, ...purchased, ...referral, ...freeSpaceIndices(cells)])]
  const isBingo = checkBingo(allCompleted, card.win_condition)

  // Recompute which scoring patterns are still satisfied once this cell is
  // gone — any pattern that was previously paid but no longer holds gets
  // its bonus reversed individually.
  const completedSet = new Set(allCompleted)
  const lineCount = completedLineIndices(allCompleted).length
  const previouslyAwardedPatterns = parseJsonStrArr(card.bonus_patterns_awarded)
  const patternsToReverse = previouslyAwardedPatterns.filter((p) => !isPatternComplete(p, lineCount, completedSet))
  const remainingAwardedPatterns = previouslyAwardedPatterns.filter((p) => isPatternComplete(p, lineCount, completedSet))

  const { data: written } = await supabase.from('player_cards').update({
    completed_cells: JSON.stringify(updatedCompleted),
    is_bingo: isBingo,
    bonus_patterns_awarded: JSON.stringify(remainingAwardedPatterns),
    updated_at: new Date().toISOString(),
  }).eq('id', card.id).eq('updated_at', card.updated_at).select('id').maybeSingle()

  if (!written) {
    return { ok: false, updatedCompleted: completed, isBingo: card.is_bingo, deedReversed: false, bingoReversed: false }
  }

  let bingoReversed = false
  for (const pattern of patternsToReverse) {
    const reversed = await reversePatternBonus(supabase, card.id, pattern, actorId, reason)
    if (reversed) bingoReversed = true
  }

  // Take back the draw entry this square earned, and hide it from the
  // Impact Board. Finds the most recent not-yet-reversed completion record
  // for this exact square — there should only ever be one at a time now
  // that marking is itself guarded, but "most recent" is the correct one
  // if any pre-fix duplicates exist from before this was wired up.
  let deedReversed = false
  const { data: deedRow } = await supabase
    .from('completed_deeds')
    .select('id')
    .eq('card_id', card.id).eq('cell_index', cellIndex)
    .eq('is_hidden_from_impact_board', false)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (deedRow) {
    deedReversed = await reverseDeedEntry(supabase, deedRow.id, actorId, reason)
    await supabase.from('completed_deeds')
      .update({ is_hidden_from_impact_board: true }).eq('id', deedRow.id)
  }

  return { ok: true, updatedCompleted, isBingo, deedReversed, bingoReversed }
}
