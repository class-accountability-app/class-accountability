// Plain-words linear projection for numeric targets.
// No charts, no smoothing — pace is a flat average over the last 7 days.
// Returns data, not a sentence: the page picks the translated message.

const DAY_MS = 24 * 60 * 60 * 1000

export type ProgressLogLike = { progress_value: number; logged_at: string }

export function sumProgress(logs: ProgressLogLike[]): number {
  return logs.reduce((sum, l) => sum + Number(l.progress_value), 0)
}

// Average daily progress over the trailing 7 days, ending "now".
export function computePace(logs: ProgressLogLike[], now: Date = new Date()): number {
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS)
  const recent = sumProgress(logs.filter((l) => new Date(l.logged_at) >= sevenDaysAgo))
  return recent / 7
}

export type Projection =
  | { kind: 'reached' }
  | { kind: 'noRecentProgress' }
  | { kind: 'onPace'; pace: number; finish: Date; deadline: string | null }

export function project({
  totalLogged,
  targetAmount,
  pace,
  deadline,
  now = new Date(),
}: {
  totalLogged: number
  targetAmount: number | null
  pace: number
  deadline: string | null
  now?: Date
}): Projection | null {
  if (targetAmount === null) return null

  const remaining = targetAmount - totalLogged
  if (remaining <= 0) return { kind: 'reached' }
  if (pace <= 0) return { kind: 'noRecentProgress' }

  return {
    kind: 'onPace',
    pace: Math.round(pace * 10) / 10,
    finish: new Date(now.getTime() + (remaining / pace) * DAY_MS),
    deadline,
  }
}
