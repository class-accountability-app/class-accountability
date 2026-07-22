// Small, shared time-formatting helpers — used by nudge timestamps (fine-grained)
// and churn detection (day-granularity threshold at >= 7 days).

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export function relativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime()

  if (diffMs < MINUTE_MS) return 'just now'
  if (diffMs < HOUR_MS) {
    const m = Math.floor(diffMs / MINUTE_MS)
    return `${m} minute${m === 1 ? '' : 's'} ago`
  }
  if (diffMs < DAY_MS) {
    const h = Math.floor(diffMs / HOUR_MS)
    return `${h} hour${h === 1 ? '' : 's'} ago`
  }
  const d = Math.floor(diffMs / DAY_MS)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

export function daysSince(iso: string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS)
}
