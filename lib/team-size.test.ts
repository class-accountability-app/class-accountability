import { describe, expect, it } from 'vitest'
import {
  TEAM_SIZE_CHOICES,
  TEAM_SIZE_DEFAULT,
  autoSplitSizes,
  isAutoSplitSize,
  isTeamFull,
  isTeamSizeLimit,
  teamLimitOf,
} from './team-size'

describe('team size limit', () => {
  it('allows 2 to 10, whole numbers only', () => {
    expect(TEAM_SIZE_CHOICES).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(isTeamSizeLimit(2)).toBe(true)
    expect(isTeamSizeLimit(10)).toBe(true)
    expect(isTeamSizeLimit(1)).toBe(false)
    expect(isTeamSizeLimit(11)).toBe(false)
    expect(isTeamSizeLimit(4.5)).toBe(false)
    expect(isTeamSizeLimit('6')).toBe(false)
  })

  it('falls back to 6 when the column is missing or odd', () => {
    expect(TEAM_SIZE_DEFAULT).toBe(6)
    expect(teamLimitOf(undefined)).toBe(6)
    expect(teamLimitOf(null)).toBe(6)
    expect(teamLimitOf(42)).toBe(6)
    expect(teamLimitOf(8)).toBe(8)
    expect(teamLimitOf('4')).toBe(4)
  })

  it('a team is full at the limit, and stays full above it', () => {
    expect(isTeamFull(5, 6)).toBe(false)
    expect(isTeamFull(6, 6)).toBe(true)
    // Lowered from 8 to 4 with 7 members: nobody leaves, no one new joins.
    expect(isTeamFull(7, 4)).toBe(true)
  })

  it('auto-split sizes go from 2 up to the limit', () => {
    expect(autoSplitSizes(6)).toEqual([2, 3, 4, 5, 6])
    expect(autoSplitSizes(3)).toEqual([2, 3])
    expect(autoSplitSizes(10)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(isAutoSplitSize(7, 6)).toBe(false)
    expect(isAutoSplitSize(7, 8)).toBe(true)
    expect(isAutoSplitSize(1, 8)).toBe(false)
  })
})
