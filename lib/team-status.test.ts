import { describe, expect, it } from 'vitest'
import { initialOf, memberStatuses, onlineFirst } from './team-status'

// 2026-11-15 10:00 JST
const now = new Date('2026-11-15T01:00:00Z')

describe('memberStatuses', () => {
  const presence = [
    { user_id: 'a', last_seen_day: '2026-11-15', online: true },
    { user_id: 'b', last_seen_day: '2026-11-13', online: false },
    { user_id: 'c', last_seen_day: '2026-11-10', online: false },
    { user_id: 'd', last_seen_day: null, online: false },
  ]
  const away = [
    { user_id: 'a', away_until: '2026-11-20' },
    { user_id: 'c', away_until: '2026-11-18' },
    { user_id: 'b', away_until: '2026-11-14' }, // ended yesterday
  ]

  it('tells online, away, offline and never apart', () => {
    const s = memberStatuses(['a', 'b', 'c', 'd', 'e'], presence, away, now)
    expect(s.map((m) => m.state)).toEqual(['online', 'offline', 'away', 'never', 'never'])
  })

  it('keeps the away day for someone who is online, and drops a break that ended', () => {
    const s = memberStatuses(['a', 'b'], presence, away, now)
    expect(s[0]).toMatchObject({ state: 'online', awayUntil: '2026-11-20' })
    expect(s[1]).toMatchObject({ state: 'offline', awayUntil: null, lastSeenDay: '2026-11-13' })
  })
})

describe('onlineFirst', () => {
  it('moves online members up and keeps the rest in order', () => {
    const list = [{ id: 1, state: 'offline' }, { id: 2, state: 'online' }, { id: 3, state: 'away' }, { id: 4, state: 'online' }] as const
    expect(onlineFirst(list).map((m) => m.id)).toEqual([2, 4, 1, 3])
  })
})

describe('initialOf', () => {
  it('takes one whole character', () => {
    expect(initialOf('佐藤')).toBe('佐')
    expect(initialOf('  aki')).toBe('a')
    expect(initialOf('👩‍🎓まい')).toBe('👩‍🎓')
    expect(initialOf('')).toBe('?')
  })
})
