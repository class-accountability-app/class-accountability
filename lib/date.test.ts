import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, formatDayAgo, formatTimeAgo, tokyoDaysAgo } from './date'

// Instants are written in UTC; comments give the Tokyo (UTC+9) wall time.
const at = (iso: string) => new Date(iso)

describe('formatDate', () => {
  it('formats a timestamp as a Tokyo calendar date', () => {
    const d = '2026-01-20T12:40:00Z' // 1/20 21:40 JST
    expect(formatDate(d, 'ja')).toBe('1月20日')
    expect(formatDate(d, 'en')).toBe('Jan 20')
  })

  it('uses the Tokyo date when it differs from the UTC date', () => {
    const d = '2026-01-20T16:00:00Z' // 1/21 01:00 JST
    expect(formatDate(d, 'ja')).toBe('1月21日')
    expect(formatDate(d, 'en')).toBe('Jan 21')
  })

  it('treats a bare YYYY-MM-DD deadline as that Tokyo date', () => {
    expect(formatDate('2026-01-20', 'ja')).toBe('1月20日')
    expect(formatDate('2026-01-20', 'en')).toBe('Jan 20')
  })
})

describe('formatDayAgo', () => {
  const now = at('2026-01-20T15:30:00Z') // 1/21 00:30 JST

  it('says today for the same Tokyo day, even minutes after midnight', () => {
    const d = '2026-01-20T15:10:00Z' // 1/21 00:10 JST
    expect(formatDayAgo(d, 'ja', now)).toBe('今日')
    expect(formatDayAgo(d, 'en', now)).toBe('Today')
  })

  it('says yesterday across Tokyo midnight even when UTC says same day', () => {
    const d = '2026-01-20T14:50:00Z' // 1/20 23:50 JST, 40 minutes earlier
    expect(formatDayAgo(d, 'ja', now)).toBe('昨日')
    expect(formatDayAgo(d, 'en', now)).toBe('Yesterday')
  })

  it('counts whole Tokyo days, with no space in Japanese', () => {
    const d = '2026-01-13T14:00:00Z' // 1/13 23:00 JST, 8 days before 1/21
    expect(formatDayAgo(d, 'ja', now)).toBe('8日前')
    expect(formatDayAgo(d, 'en', now)).toBe('8 days ago')
  })

  it('never shows a future day for a timestamp slightly ahead of now', () => {
    expect(formatDayAgo('2026-01-21T15:00:00Z', 'en', now)).toBe('Today')
  })
})

describe('tokyoDaysAgo', () => {
  it('is based on Tokyo calendar days, not 24-hour blocks', () => {
    const now = at('2026-01-20T15:30:00Z') // 1/21 00:30 JST
    expect(tokyoDaysAgo('2026-01-20T14:50:00Z', now)).toBe(1)
    expect(tokyoDaysAgo('2026-01-14T00:00:00Z', now)).toBe(7) // 1/14 09:00 JST
  })
})

describe('formatTimeAgo', () => {
  const now = at('2026-01-20T12:00:00Z') // 1/20 21:00 JST

  it('shows now, minutes and hours within the same Tokyo day', () => {
    expect(formatTimeAgo('2026-01-20T11:59:40Z', 'ja', now)).toBe('今')
    expect(formatTimeAgo('2026-01-20T11:59:40Z', 'en', now)).toBe('Now')
    expect(formatTimeAgo('2026-01-20T11:55:00Z', 'ja', now)).toBe('5分前')
    expect(formatTimeAgo('2026-01-20T11:55:00Z', 'en', now)).toBe('5 minutes ago')
    expect(formatTimeAgo('2026-01-20T09:00:00Z', 'ja', now)).toBe('3時間前')
    expect(formatTimeAgo('2026-01-20T09:00:00Z', 'en', now)).toBe('3 hours ago')
  })

  it('switches to day labels once Tokyo midnight is crossed', () => {
    const afterMidnight = at('2026-01-20T16:00:00Z') // 1/21 01:00 JST
    const d = '2026-01-20T14:00:00Z' // 1/20 23:00 JST
    expect(formatTimeAgo(d, 'ja', afterMidnight)).toBe('昨日')
    expect(formatTimeAgo(d, 'en', afterMidnight)).toBe('Yesterday')
  })
})

describe('formatDateTime', () => {
  const now = at('2026-01-20T13:00:00Z') // 1/20 22:00 JST

  it('uses the day word for today and yesterday', () => {
    expect(formatDateTime('2026-01-20T12:40:00Z', 'ja', now)).toBe('今日 21:40')
    expect(formatDateTime('2026-01-20T12:40:00Z', 'en', now)).toMatch(/^Today 9:40\sPM$/)
    expect(formatDateTime('2026-01-19T12:40:00Z', 'ja', now)).toBe('昨日 21:40')
  })

  it('uses the date for anything older', () => {
    expect(formatDateTime('2026-01-02T13:10:00Z', 'ja', now)).toBe('1月2日 22:10')
    expect(formatDateTime('2026-01-02T13:10:00Z', 'en', now)).toMatch(/^Jan 2, 10:10\sPM$/)
  })
})
