import { addDaysYmd, tokyoToday } from './date'

// お休み (0049): "away until <day>", told to the team. The database applies
// the same limits (set_away): today or later, at most 30 days ahead, in Tokyo
// days. Checking here first gives the student a plain message.
export const AWAY_MAX_DAYS = 30

const YMD = /^\d{4}-\d{2}-\d{2}$/

export function checkAwayUntil(raw: string, now: Date = new Date()): { ok: true; value: string } | { ok: false } {
  const value = raw.trim()
  if (!YMD.test(value) || Number.isNaN(Date.parse(value))) return { ok: false }
  const today = tokyoToday(now)
  if (value < today || value > addDaysYmd(today, AWAY_MAX_DAYS)) return { ok: false }
  return { ok: true, value }
}

// Whether a stored away day still counts today (a break that ended is over
// without anyone clearing it).
export function isAway(awayUntil: string | null | undefined, now: Date = new Date()): boolean {
  return !!awayUntil && awayUntil >= tokyoToday(now)
}
