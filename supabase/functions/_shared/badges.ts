// =============================================================================
// Badge tiers by lifetime deed count — pure, no imports, shared by
// game/index.ts and any leaderboard/admin route that shows a player's badge.
// =============================================================================

export function getBadge(totalDeeds: number): { name: string; emoji: string; next_name: string | null; next_emoji: string | null; deeds_to_next: number | null } {
  const tiers = [
    { min: 0,   name: 'Newcomer',  emoji: '🌱' },
    { min: 5,   name: 'Starter',   emoji: '⭐' },
    { min: 10,  name: 'Builder',   emoji: '🔨' },
    { min: 25,  name: 'Champion',  emoji: '🏆' },
    { min: 50,  name: 'Hero',      emoji: '🦸' },
    { min: 75,  name: 'Legend',    emoji: '🌟' },
    { min: 100, name: 'Expert',    emoji: '👑' },
  ]
  let current = tiers[0]
  let nextTier: typeof tiers[0] | null = tiers[1]
  for (let i = 0; i < tiers.length; i++) {
    if (totalDeeds >= tiers[i].min) {
      current = tiers[i]
      nextTier = tiers[i + 1] ?? null
    }
  }
  return {
    name: current.name,
    emoji: current.emoji,
    next_name: nextTier?.name ?? null,
    next_emoji: nextTier?.emoji ?? null,
    deeds_to_next: nextTier ? nextTier.min - totalDeeds : null,
  }
}
