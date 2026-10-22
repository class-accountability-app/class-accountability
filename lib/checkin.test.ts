import { describe, expect, it } from 'vitest'
import { checkinStatus, missingCheckins, previousRoundStart, roundStartFor } from './checkin'

// Instants are UTC; comments give Tokyo (UTC+9) wall time.
const at = (iso: string) => new Date(iso)

describe('roundStartFor', () => {
  // The same cases as checkin_round_start in supabase/tests/rls_group_projects.sql.
  it('matches the database function', () => {
    expect(roundStartFor('2026-10-01', 4, '2026-10-01')).toBe('2026-10-01')
    expect(roundStartFor('2026-10-01', 4, '2026-10-04')).toBe('2026-10-01')
    expect(roundStartFor('2026-10-01', 4, '2026-10-05')).toBe('2026-10-05')
    expect(roundStartFor('2026-10-01', 4, '2026-10-12')).toBe('2026-10-09')
    expect(roundStartFor('2026-10-01', 4, '2026-09-20')).toBe('2026-10-01')
  })

  it('works with a cadence of 1 and across a month end', () => {
    expect(roundStartFor('2026-10-01', 1, '2026-10-07')).toBe('2026-10-07')
    expect(roundStartFor('2026-10-28', 4, '2026-11-03')).toBe('2026-11-01')
  })
})

describe('checkinStatus', () => {
  it('reports the current round and days until it is due', () => {
    const s = checkinStatus('2026-10-01', 4, [], at('2026-10-05T03:00:00Z')) // 10/5 12:00 JST
    expect(s).toEqual({
      roundStart: '2026-10-05',
      dueOn: '2026-10-08',
      daysUntilDue: 3,
      submitted: false,
      nextRoundStart: '2026-10-09',
    })
  })

  it('is due today on the last day of the round', () => {
    expect(checkinStatus('2026-10-01', 4, [], at('2026-10-08T03:00:00Z')).daysUntilDue).toBe(0)
  })

  it('uses the Tokyo day, not the UTC day', () => {
    // 10/4 20:00 UTC is 10/5 05:00 JST: already the next round.
    expect(checkinStatus('2026-10-01', 4, [], at('2026-10-04T20:00:00Z')).roundStart).toBe('2026-10-05')
  })

  it('marks submitted only for this round', () => {
    const now = at('2026-10-05T03:00:00Z')
    expect(checkinStatus('2026-10-01', 4, ['2026-10-01'], now).submitted).toBe(false)
    expect(checkinStatus('2026-10-01', 4, ['2026-10-01', '2026-10-05'], now).submitted).toBe(true)
  })

  it('before the start date, the round is the first one', () => {
    const s = checkinStatus('2026-10-10', 4, [], at('2026-10-01T03:00:00Z'))
    expect(s.roundStart).toBe('2026-10-10')
    expect(s.daysUntilDue).toBe(12)
  })
})

describe('missingCheckins', () => {
  const checkins = [
    { userId: 'a', roundStart: '2026-10-05' },
    { userId: 'b', roundStart: '2026-10-01' },
  ]

  it('lists members with no check-in in the given round, keeping order', () => {
    expect(missingCheckins(['a', 'b', 'c'], checkins, '2026-10-05')).toEqual(['b', 'c'])
  })

  it('is empty when everyone has checked in', () => {
    expect(missingCheckins(['a'], checkins, '2026-10-05')).toEqual([])
  })
})

describe('previousRoundStart', () => {
  it('is null during the first round', () => {
    expect(previousRoundStart('2026-10-01', 4, at('2026-10-03T03:00:00Z'))).toBeNull()
  })

  it('is the round before the current one', () => {
    expect(previousRoundStart('2026-10-01', 4, at('2026-10-05T03:00:00Z'))).toBe('2026-10-01')
    expect(previousRoundStart('2026-10-01', 4, at('2026-10-12T03:00:00Z'))).toBe('2026-10-05')
  })
})
