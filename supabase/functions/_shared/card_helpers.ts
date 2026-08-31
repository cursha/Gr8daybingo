// =============================================================================
// Core card/cell types and small helpers, shared by game/index.ts and every
// extracted route module that touches card_data.
// =============================================================================
import { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export interface Cell {
  index: number
  deed_text: string
  deed_text_long: string | null
  deed_id: number | null
  is_free_space: boolean
  is_purchasable: boolean
  purchase_price: number | null
  is_referral_free: boolean
  is_secret: boolean
  secret_reward: number | null
  secret_revealed?: boolean
  // Bomb Square — ~1% of classic cards hide one (admin-configurable via
  // bomb_square_probability_pct). Never sent to the client under any
  // circumstance (see sanitizeCells in game/index.ts) — the whole point is
  // nobody, including the player looking at their own card, knows it's
  // there until they tap it.
  is_bomb?: boolean
  quantity: number
  category: string | null
  // I Dare Ya — snapshotted at generation, revealed on first center-cell click.
  // Renamed 2026-07-23 from "Bet Ya"; the bet_ya_* fields stay declared
  // (never written on new cards) purely so a card generated before that
  // rename still reads correctly — see dareYaField() below.
  dare_ya_outcome_type?: string | null
  dare_ya_label?: string | null
  dare_ya_action_value?: number | null
  dare_ya_revealed?: boolean
  bet_ya_outcome_type?: string | null
  bet_ya_label?: string | null
  bet_ya_action_value?: number | null
  bet_ya_revealed?: boolean
}

// A card generated before the 2026-07-23 Bet Ya -> Dare Ya rename has these
// fields under the old bet_ya_* keys in its already-persisted card_data JSON;
// a card generated after only ever has dare_ya_*. Prefer the new key, fall
// back to the old one, so both keep working without a data backfill.
export function dareYaField<K extends 'outcome_type' | 'label' | 'action_value' | 'revealed'>(
  cell: Cell, key: K,
): Cell[`dare_ya_${K}`] {
  const newKey = `dare_ya_${key}` as const
  const oldKey = `bet_ya_${key}` as const
  return (cell[newKey] ?? cell[oldKey]) as Cell[`dare_ya_${K}`]
}

// ── Security: strip secret fields before sending cells to client ─────────────
// is_secret/secret_reward and dare_ya outcome details must never be exposed
// until the respective square has been revealed by the player.
export function sanitizeCells(cells: Cell[], completedCells: number[], hiddenCells?: number[]): unknown[] {
  const hiddenSet = new Set(hiddenCells ?? [])
  return cells.map((c) => {
    // Blackout fog: a still-hidden square's deed content must never reach the
    // client — otherwise a player could read the network response and know
    // what's under a square before revealing it.
    if (hiddenSet.has(c.index)) {
      return {
        index: c.index, is_free_space: false, is_purchasable: false, purchase_price: null,
        is_referral_free: false, is_secret: false, secret_reward: null, quantity: 1,
        category: null, deed_text: null, deed_text_long: null, deed_id: null,
        is_hidden: true,
      }
    }

    const secretRevealed = c.secret_revealed === true || completedCells.includes(c.index)
    const { is_secret, secret_reward, secret_revealed, is_bomb,
            dare_ya_outcome_type, dare_ya_label, dare_ya_action_value,
            bet_ya_outcome_type, bet_ya_label, bet_ya_action_value,
            ...rest } = c
    return {
      ...rest,
      ...(is_secret && secretRevealed ? { is_secret: true, secret_reward, secret_revealed: true } : {}),
      // Expose I Dare Ya details only after the player has clicked and revealed
      ...(dareYaField(c, 'revealed')
        ? {
            dare_ya_outcome_type: dareYaField(c, 'outcome_type'),
            dare_ya_label: dareYaField(c, 'label'),
            dare_ya_action_value: dareYaField(c, 'action_value'),
          }
        : {}),
    }
  })
}

export function parseJsonArr(raw: string | null | undefined): number[] {
  try { return JSON.parse(raw ?? '[]') } catch { return [] }
}

export function parseJsonStrArr(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[]
  try { return JSON.parse((raw as string) ?? '[]') } catch { return [] }
}

/** Free-space cells (the centre "I Dare Ya" square) always count toward
 *  Bingo, even though they are never "marked". Returns their indices. */
export function freeSpaceIndices(cells: Cell[]): number[] {
  return cells.filter((c) => c.is_free_space).map((c) => c.index)
}

// A player's "current" card is simply their most recently created one — no
// longer gated to matching today's calendar week. A card lives until the
// player taps out or completes a bingo; neither of those replaces the row,
// they just insert a newer one, so "most recent" is always the right
// answer without needing an is_active flag.
export async function getPlayerCurrentCard(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data } = await supabase
    .from('player_cards')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}
