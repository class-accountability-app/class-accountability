import { describe, expect, it } from 'vitest'
import { expectedPercent, teamPace } from './team-summary'

// 2026-10-30 10:00 JST
const now = new Date('2026-10-30T01:00:00Z')

describe('expectedPercent', () => {
  it('is the share of Tokyo days passed between start and deadline', () => {
    expect(expectedPercent('2026-10-20', '2026-11-09', now)).toBe(50)
    expect(expectedPercent('2026-10-30', '2026-11-30', now)).toBe(0)
    expect(expectedPercent('2026-10-01', '2026-10-20', now)).toBe(100)
  })

  it('is null without a deadline and 100 for a same-day deadline', () => {
    expect(expectedPercent('2026-10-01', null, now)).toBeNull()
    expect(expectedPercent('2026-10-30', '2026-10-30', now)).toBe(100)
  })
})

describe('teamPace', () => {
  const base = { hasProject: true, startDate: '2026-10-20', deadline: '2026-11-09' }

  it('is notStarted without a project', () => {
    expect(teamPace({ hasProject: false, percent: 0, startDate: null, deadline: null }, now)).toBe('notStarted')
  })

  it('allows 10 points below the expected pace', () => {
    expect(teamPace({ ...base, percent: 40 }, now)).toBe('onTrack')
    expect(teamPace({ ...base, percent: 39 }, now)).toBe('behind')
  })

  it('is onTrack with no deadline', () => {
    expect(teamPace({ ...base, deadline: null, percent: 0 }, now)).toBe('onTrack')
  })
})
