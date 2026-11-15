import { describe, expect, it } from 'vitest'
import { checkAwayUntil, isAway } from './away'

// 2026-11-15 10:00 JST
const now = new Date('2026-11-15T01:00:00Z')

describe('checkAwayUntil', () => {
  it('accepts today and up to 30 days ahead, in Tokyo days', () => {
    expect(checkAwayUntil('2026-11-15', now)).toEqual({ ok: true, value: '2026-11-15' })
    expect(checkAwayUntil('2026-12-15', now)).toEqual({ ok: true, value: '2026-12-15' })
  })
  it('refuses a past day, a day too far ahead and anything that is not a date', () => {
    expect(checkAwayUntil('2026-11-14', now).ok).toBe(false)
    expect(checkAwayUntil('2026-12-16', now).ok).toBe(false)
    expect(checkAwayUntil('', now).ok).toBe(false)
    expect(checkAwayUntil('tomorrow', now).ok).toBe(false)
    expect(checkAwayUntil('2026-13-40', now).ok).toBe(false)
  })
  it('uses the Tokyo day just after midnight JST', () => {
    // 2026-11-16 00:30 JST is still 2026-11-15 in UTC.
    expect(checkAwayUntil('2026-11-15', new Date('2026-11-15T15:30:00Z')).ok).toBe(false)
  })
})

describe('isAway', () => {
  it('counts through the last day and not after', () => {
    expect(isAway('2026-11-15', now)).toBe(true)
    expect(isAway('2026-11-14', now)).toBe(false)
    expect(isAway(null, now)).toBe(false)
  })
})
