// =============================================================================
// Pure ISO-week helpers, used throughout game/index.ts and its route modules
// for anything keyed to a game week (card generation, draw entries, admin
// filters, etc.). No external imports, so it is trivially unit-testable.
// =============================================================================

export function getCurrentWeekYear(): string {
  const now = new Date()
  // ISO week number: Thursday of the week determines the year
  const thursday = new Date(now)
  thursday.setDate(now.getDate() + (4 - (now.getDay() || 7)))
  const year = thursday.getFullYear()
  const jan1 = new Date(year, 0, 1)
  const week = Math.ceil(
    ((thursday.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7,
  )
  return `${year}-W${String(week).padStart(2, '0')}`
}

export function getWeekStart(weekYear: string): Date {
  const [year, weekStr] = weekYear.split('-W')
  const week = parseInt(weekStr)
  const jan1 = new Date(parseInt(year), 0, 1)
  const jan1Day = jan1.getDay() || 7 // Mon=1..Sun=7
  const daysToMonday = (8 - jan1Day) % 7
  const firstMonday = new Date(jan1)
  firstMonday.setDate(jan1.getDate() + daysToMonday)
  const weekStart = new Date(firstMonday)
  weekStart.setDate(firstMonday.getDate() + (week - 1) * 7)
  return weekStart
}
