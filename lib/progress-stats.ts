import { tokyoDaysAgo, tokyoDaysUntil, tokyoWeekStart, tokyoWeekday } from './date'
import type { TargetType } from './targets'

// The numbers on Home's target cards, 今週記録した日 and ポッドの様子
// (Prompt 11). Plain data in, plain data out: the components pick the
// translated words. Every "today" and "this week" is a Tokyo calendar day.

export type LogLike = { value: number; loggedAt: string }

export const MILESTONES = [25, 50, 75, 100] as const
export type Milestone = (typeof MILESTONES)[number]

// A podmate with no log for this many Tokyo days gets 「声かけする」.
export const NUDGE_AFTER_DAYS = 3

// Rounds away floating-point noise (0.1 + 0.2).
function tidy(value: number): number {
  return Math.round(value * 100) / 100
}

// 今週 +○: everything logged since Monday 00:00 JST. A document target's
// rows (Prompt 12) can be negative, so this can be 0 or less; the card then
// shows no 今週 line.
export function weekTotal(logs: LogLike[], now: Date): number {
  const start = tokyoWeekStart(now).getTime()
  return tidy(logs.reduce((sum, l) => (new Date(l.loggedAt).getTime() >= start ? sum + l.value : sum), 0))
}

// 今週記録した日: seven flags, Monday to Sunday, true on a day with at least
// one log this week.
export function loggedDays(logs: LogLike[], now: Date): boolean[] {
  const start = tokyoWeekStart(now).getTime()
  const days = Array<boolean>(7).fill(false)
  for (const l of logs) {
    if (new Date(l.loggedAt).getTime() >= start) days[tokyoWeekday(l.loggedAt)] = true
  }
  return days
}

// 残り○日: whole Tokyo days until the deadline (0 = today, negative = passed),
// or null without one.
export function daysLeft(deadline: string | null, now: Date): number | null {
  return deadline === null ? null : tokyoDaysUntil(deadline, now)
}

export type Pace =
  | { kind: 'none' } // no amount, no deadline, or the deadline has passed
  | { kind: 'done' }
  | { kind: 'perDay'; amount: number; today: boolean } // today: the deadline is today

// 「1日あたり約○で間に合います」: what's left ÷ the days left, rounded up
// (whole numbers, or tenths for hours). On the deadline itself, everything
// that's left is today's share.
export function pace({
  type,
  total,
  target,
  deadline,
  now,
}: {
  type: TargetType
  total: number
  target: number | null
  deadline: string | null
  now: Date
}): Pace {
  if (type === 'task' || target === null) return { kind: 'none' }
  const remaining = tidy(target - total)
  if (remaining <= 0) return { kind: 'done' }
  const left = daysLeft(deadline, now)
  if (left === null || left < 0) return { kind: 'none' }
  const days = Math.max(left, 1)
  const step = type === 'study_hours' ? 10 : 1
  // Rounded to 6 places first, so 0.3 / 1 doesn't round up to 0.4.
  const amount = Math.ceil(Math.round((remaining / days) * step * 1e6) / 1e6) / step
  return { kind: 'perDay', amount, today: left === 0 }
}

function percent(total: number, target: number): number {
  return target > 0 ? (total / target) * 100 : 0
}

// The milestone a log crossed, if any: the highest of 25 / 50 / 75 / 100 that
// `before` was under and `after` reaches. 20% → 80% says 75, not 25 and 50.
export function milestoneCrossed(before: number, after: number, target: number | null): Milestone | null {
  if (target === null || target <= 0 || after <= before) return null
  const from = percent(before, target)
  const to = percent(after, target)
  let crossed: Milestone | null = null
  for (const m of MILESTONES) if (from < m && to >= m) crossed = m
  return crossed
}

// 「あと○で75%」: the next tick still ahead, and how much it takes to reach
// it. Null once the target is done (or without an amount).
export function nextMilestone(total: number, target: number | null): { percent: Milestone; remaining: number } | null {
  if (target === null || target <= 0) return null
  const current = percent(total, target)
  const next = MILESTONES.find((m) => m > current && m < 100)
  if (next === undefined) return null
  return { percent: next, remaining: tidy(Math.ceil(((target * next) / 100 - total) * 100) / 100) }
}

// ポッドの様子: a podmate who has never logged, or not for 3+ Tokyo days.
export function needsNudge(lastLoggedAt: string | null, now: Date): boolean {
  return lastLoggedAt === null || tokyoDaysAgo(lastLoggedAt, now) >= NUDGE_AFTER_DAYS
}
