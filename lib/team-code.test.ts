import { describe, expect, it } from 'vitest'
import { normalizeTeamCode, teamJoinUrl } from './team-code'

describe('normalizeTeamCode', () => {
  it('accepts a code typed with spaces, hyphens, lower case or full-width', () => {
    expect(normalizeTeamCode('k7m3 q9tx')).toBe('K7M3Q9TX')
    expect(normalizeTeamCode('K7M3-Q9TX')).toBe('K7M3Q9TX')
    expect(normalizeTeamCode('ｋ７ｍ３－Ｑ９ＴＸ')).toBe('K7M3Q9TX')
  })

  it('accepts a pasted team link', () => {
    expect(normalizeTeamCode('https://www.study-pods.org/team/K7M3Q9TX?x=1')).toBe('K7M3Q9TX')
    expect(normalizeTeamCode('study-pods.org/team/k7m3q9tx')).toBe('K7M3Q9TX')
  })

  it('refuses anything that cannot be a code', () => {
    expect(normalizeTeamCode('')).toBeNull()
    expect(normalizeTeamCode('K7M3Q9T')).toBeNull()
    expect(normalizeTeamCode('K7M3Q9T0')).toBeNull() // 0 is not in the alphabet
    expect(normalizeTeamCode('/team/%E0%A4%A')).toBeNull()
  })
})

describe('teamJoinUrl', () => {
  it('is origin + /team/{code}', () => {
    expect(teamJoinUrl('https://www.study-pods.org', 'K7M3Q9TX')).toBe('https://www.study-pods.org/team/K7M3Q9TX')
  })
})
