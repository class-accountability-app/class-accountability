// The team size limit (0053): each class's organizer picks how many students
// a team may have, from 2 to 10; every class starts at 6. Pure, so the
// setting, the actions and the pages share one set of rules (the database
// checks them again). Lowering the limit never removes anyone: a team already
// over it just takes no one new.

export const TEAM_SIZE_MIN = 2
export const TEAM_SIZE_MAX = 10
export const TEAM_SIZE_DEFAULT = 6

export const TEAM_SIZE_CHOICES: readonly number[] = Array.from(
  { length: TEAM_SIZE_MAX - TEAM_SIZE_MIN + 1 },
  (_, i) => TEAM_SIZE_MIN + i
)

export function isTeamSizeLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= TEAM_SIZE_MIN && value <= TEAM_SIZE_MAX
}

// A limit read from the database, or the default when the column isn't
// there yet (the app may deploy before the migration) or the value is odd.
export function teamLimitOf(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value
  return isTeamSizeLimit(n) ? n : TEAM_SIZE_DEFAULT
}

export function isTeamFull(members: number, limit: number): boolean {
  return members >= limit
}

// Sizes auto-split may use in a class with this limit: 2 up to the limit.
export function autoSplitSizes(limit: number): number[] {
  return TEAM_SIZE_CHOICES.filter((n) => n <= teamLimitOf(limit))
}

export function isAutoSplitSize(value: unknown, limit: number): value is number {
  return typeof value === 'number' && autoSplitSizes(limit).includes(value)
}
