// Plain-words linear projection for word_count / study_hours targets.
// No charts, no smoothing — pace is a flat average over the last 7 days.

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

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function projectionText({
  unitLabel,
  totalLogged,
  targetAmount,
  pace,
  deadline,
  now = new Date(),
}: {
  unitLabel: string // e.g. 'words' or 'hours'
  totalLogged: number
  targetAmount: number | null
  pace: number
  deadline: string | null // date string, e.g. '2026-08-05'
  now?: Date
}): string | null {
  if (targetAmount === null) return null

  const remaining = targetAmount - totalLogged
  const deadlineStr = deadline ? formatDate(new Date(deadline)) : null

  if (remaining <= 0) {
    return 'Target reached.'
  }

  if (pace <= 0) {
    return 'No recent progress.'
  }

  const daysToFinish = remaining / pace
  const finishDate = new Date(now.getTime() + daysToFinish * DAY_MS)
  const paceRounded = Math.round(pace * 10) / 10

  const base = `At ${paceRounded} ${unitLabel}/day (last 7 days), you'd finish around ${formatDate(finishDate)}`
  return deadlineStr ? `${base} — deadline ${deadlineStr}` : `${base}.`
}
