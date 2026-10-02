import { describe, expect, it } from 'vitest'
import { formatDateWithWeekday, formatTimeAgo, tokyoDaysUntil, tokyoWeekStart, tokyoWeekday } from './date'
import {
  daysLeft,
  loggedDays,
  milestoneCrossed,
  needsNudge,
  nextMilestone,
  pace,
  weekTotal,
} from './progress-stats'

// Instants are written in UTC; comments give the Tokyo (UTC+9) wall time.
const at = (iso: string) => new Date(iso)
const log = (loggedAt: string, value = 100) => ({ loggedAt, value })

describe('tokyoWeekStart', () => {
  it('is Monday 00:00 JST for a mid-week moment', () => {
    // Fri 2 Oct 2026 12:00 JST → Mon 28 Sep 00:00 JST = 27 Sep 15:00 UTC
    expect(tokyoWeekStart(at('2026-10-02T03:00:00Z')).toISOString()).toBe('2026-09-27T15:00:00.000Z')
  })

  it('uses the Tokyo day, not the UTC day, just after Tokyo midnight', () => {
    // Mon 28 Sep 00:10 JST is still Sunday in UTC
    expect(tokyoWeekStart(at('2026-09-27T15:10:00Z')).toISOString()).toBe('2026-09-27T15:00:00.000Z')
  })

  it('keeps Sunday 23:59 JST in the week that started six days before', () => {
    // Sun 4 Oct 23:59 JST
    expect(tokyoWeekStart(at('2026-10-04T14:59:00Z')).toISOString()).toBe('2026-09-27T15:00:00.000Z')
  })

  it('starts a new week at Monday 00:00 JST', () => {
    // Mon 5 Oct 00:00 JST exactly
    expect(tokyoWeekStart(at('2026-10-04T15:00:00Z')).toISOString()).toBe('2026-10-04T15:00:00.000Z')
  })

  it('numbers the Tokyo weekday from Monday', () => {
    expect(tokyoWeekday('2026-09-27T15:00:00Z')).toBe(0) // Mon 00:00 JST
    expect(tokyoWeekday('2026-10-04T14:59:00Z')).toBe(6) // Sun 23:59 JST
  })
})

describe('formatDateWithWeekday', () => {
  it('shows the Tokyo date and weekday', () => {
    const d = '2026-10-01T16:00:00Z' // Fri 2 Oct 01:00 JST
    expect(formatDateWithWeekday(d, 'ja')).toBe('10月2日（金）')
    expect(formatDateWithWeekday(d, 'en')).toBe('Fri, Oct 2')
  })
})

describe('weekTotal', () => {
  const now = at('2026-10-02T03:00:00Z') // Fri 12:00 JST

  it('sums only what was logged since Monday 00:00 JST', () => {
    const logs = [
      log('2026-09-27T14:59:00Z', 500), // Sun 27 Sep 23:59 JST: last week
      log('2026-09-27T15:00:00Z', 100), // Mon 00:00 JST: this week
      log('2026-10-01T10:00:00Z', 40), // Thu 19:00 JST
    ]
    expect(weekTotal(logs, now)).toBe(140)
  })

  it('tidies floating-point sums of hours', () => {
    expect(weekTotal([log('2026-10-01T00:00:00Z', 0.1), log('2026-10-01T01:00:00Z', 0.2)], now)).toBe(0.3)
  })

  it('can be zero or less (a document whose text was deleted)', () => {
    expect(weekTotal([log('2026-10-01T00:00:00Z', 300), log('2026-10-01T02:00:00Z', -400)], now)).toBe(-100)
  })
})

describe('loggedDays', () => {
  it('marks Monday to Sunday by Tokyo day', () => {
    const now = at('2026-10-02T03:00:00Z') // Fri 12:00 JST
    const days = loggedDays(
      [
        log('2026-09-27T15:30:00Z'), // Mon 00:30 JST
        log('2026-09-29T14:59:00Z'), // Tue 23:59 JST
        log('2026-10-01T16:00:00Z'), // Fri 01:00 JST
        log('2026-09-26T03:00:00Z'), // last Saturday
      ],
      now
    )
    expect(days).toEqual([true, true, false, false, true, false, false])
  })
})

describe('daysLeft', () => {
  const now = at('2026-10-02T14:59:00Z') // Fri 23:59 JST

  it('counts Tokyo calendar days to the deadline', () => {
    expect(daysLeft('2026-10-04', now)).toBe(2)
    expect(tokyoDaysUntil('2026-10-04', at('2026-10-02T15:00:00Z'))).toBe(1) // Sat 00:00 JST
  })

  it('is 0 on the day and negative after it', () => {
    expect(daysLeft('2026-10-02', now)).toBe(0)
    expect(daysLeft('2026-10-01', now)).toBe(-1)
  })

  it('is null without a deadline', () => {
    expect(daysLeft(null, now)).toBeNull()
  })
})

describe('pace', () => {
  const now = at('2026-10-02T03:00:00Z') // Fri 2 Oct JST
  const chars = { type: 'character_count' as const, target: 2000, now }

  it('divides what is left by the days left, rounded up', () => {
    expect(pace({ ...chars, total: 1240, deadline: '2026-10-04' })).toEqual({ kind: 'perDay', amount: 380, today: false })
    expect(pace({ ...chars, total: 1000, deadline: '2026-10-05' })).toEqual({ kind: 'perDay', amount: 334, today: false })
  })

  it('rounds hours up to tenths', () => {
    const hours = { type: 'study_hours' as const, target: 10, now }
    expect(pace({ ...hours, total: 3, deadline: '2026-10-28' })).toEqual({ kind: 'perDay', amount: 0.3, today: false })
    expect(pace({ ...hours, total: 9.7, deadline: '2026-10-03' })).toEqual({ kind: 'perDay', amount: 0.3, today: false })
  })

  it('puts everything that is left on today when the deadline is today', () => {
    expect(pace({ ...chars, total: 1500, deadline: '2026-10-02' })).toEqual({ kind: 'perDay', amount: 500, today: true })
  })

  it('says nothing once the deadline has passed or without one', () => {
    expect(pace({ ...chars, total: 1500, deadline: '2026-10-01' })).toEqual({ kind: 'none' })
    expect(pace({ ...chars, total: 1500, deadline: null })).toEqual({ kind: 'none' })
  })

  it('is done once the target is reached, even after the deadline', () => {
    expect(pace({ ...chars, total: 2000, deadline: '2026-10-01' })).toEqual({ kind: 'done' })
    expect(pace({ ...chars, total: 2400, deadline: '2026-10-09' })).toEqual({ kind: 'done' })
  })

  it('has nothing for tasks or targets without an amount', () => {
    expect(pace({ type: 'task', total: 0, target: null, deadline: '2026-10-09', now })).toEqual({ kind: 'none' })
    expect(pace({ ...chars, target: null, total: 10, deadline: '2026-10-09' })).toEqual({ kind: 'none' })
  })
})

describe('milestoneCrossed', () => {
  it('fires when a log lands exactly on 50%', () => {
    expect(milestoneCrossed(900, 1000, 2000)).toBe(50)
  })

  it('does not fire again when already past it', () => {
    expect(milestoneCrossed(1000, 1100, 2000)).toBeNull()
  })

  it('names only the highest milestone when one log jumps several', () => {
    expect(milestoneCrossed(400, 1600, 2000)).toBe(75) // 20% → 80%
  })

  it('reaches 100% at the target and beyond', () => {
    expect(milestoneCrossed(1900, 2000, 2000)).toBe(100)
    expect(milestoneCrossed(1900, 2500, 2000)).toBe(100)
  })

  it('needs an amount and an increase', () => {
    expect(milestoneCrossed(0, 100, null)).toBeNull()
    expect(milestoneCrossed(1200, 900, 2000)).toBeNull()
  })
})

describe('nextMilestone', () => {
  it('is the next tick ahead and how far it is', () => {
    expect(nextMilestone(1240, 2000)).toEqual({ percent: 75, remaining: 260 })
    expect(nextMilestone(0, 2000)).toEqual({ percent: 25, remaining: 500 })
    expect(nextMilestone(1000, 2000)).toEqual({ percent: 75, remaining: 500 })
  })

  it('stops after 75% (the rest is あと○字)', () => {
    expect(nextMilestone(1600, 2000)).toBeNull()
    expect(nextMilestone(2000, 2000)).toBeNull()
  })

  it('works with hours', () => {
    expect(nextMilestone(3, 10)).toEqual({ percent: 50, remaining: 2 })
  })
})

describe('needsNudge and the last-logged wording', () => {
  const now = at('2026-10-02T03:00:00Z') // Fri 12:00 JST

  it('is due after 3 Tokyo days without a log, or with none at all', () => {
    expect(needsNudge(null, now)).toBe(true)
    expect(needsNudge('2026-09-28T14:59:00Z', now)).toBe(true) // Mon 23:59 JST: 4 days
    expect(needsNudge('2026-09-29T00:00:00Z', now)).toBe(true) // Tue 09:00: 3 days
    expect(needsNudge('2026-09-29T15:00:00Z', now)).toBe(false) // Wed 00:00: 2 days
  })

  it('reads 2時間前 / 3日前', () => {
    expect(formatTimeAgo('2026-10-02T01:00:00Z', 'ja', now)).toBe('2時間前')
    expect(formatTimeAgo('2026-09-29T03:00:00Z', 'ja', now)).toBe('3日前')
    expect(formatTimeAgo('2026-10-01T03:00:00Z', 'ja', now)).toBe('昨日')
    expect(formatTimeAgo('2026-10-02T01:00:00Z', 'en', now)).toBe('2 hours ago')
    expect(formatTimeAgo('2026-09-29T03:00:00Z', 'en', now)).toBe('3 days ago')
  })
})
