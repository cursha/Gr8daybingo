// =============================================================================
// Deed targeting: which deeds a player's targeting values make them eligible
// for. Shared by card generation, the Bomb Square reroll, quick-tap eligible
// lists, and the I Dare Ya "replace three" outcome.
// =============================================================================
import { SupabaseClient } from 'npm:@supabase/supabase-js@2'

/** Fetch a player's targeting value IDs and a map of deed_id → Set of targeting_value_ids. */
export async function fetchTargetingData(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ playerValueIds: Set<number>; deedTargetingMap: Map<number, Set<number>> }> {
  const { data: userValues } = await supabase
    .from('user_targeting_values').select('targeting_value_id').eq('user_id', userId)
  const playerValueIds = new Set<number>((userValues ?? []).map((r) => Number(r.targeting_value_id)))

  const { data: deedValues } = await supabase
    .from('deed_targeting_values').select('deed_id, targeting_value_id')
  const deedTargetingMap = new Map<number, Set<number>>()
  for (const r of deedValues ?? []) {
    const deedId = Number(r.deed_id)
    const valueId = Number(r.targeting_value_id)
    if (!deedTargetingMap.has(deedId)) deedTargetingMap.set(deedId, new Set())
    deedTargetingMap.get(deedId)!.add(valueId)
  }

  return { playerValueIds, deedTargetingMap }
}

/** Filter deeds to those matching the player's targeting values.
 *  Deeds with no targeting entries are universal (always included).
 *  Falls back to `fallback` if fewer than `minCount` deeds survive.
 *  Returns candidates unchanged if the player has no targeting values set. */
export function filterDeedsByTargeting<T extends { id: number }>(
  candidates: T[],
  playerValueIds: Set<number>,
  deedTargetingMap: Map<number, Set<number>>,
  fallback: T[],
  minCount = 24,
): T[] {
  if (playerValueIds.size === 0) return candidates
  const filtered = candidates.filter((d) => {
    const vals = deedTargetingMap.get(d.id)
    if (!vals || vals.size === 0) return true
    for (const v of vals) { if (playerValueIds.has(v)) return true }
    return false
  })
  return filtered.length >= minCount ? filtered : fallback
}
