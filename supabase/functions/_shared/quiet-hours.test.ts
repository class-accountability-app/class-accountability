import { describe, expect, it } from 'vitest'
import { isQuietHours } from './quiet-hours'

// Tokyo times written with their +09:00 offset; Vitest runs in Los Angeles
// time (vitest.config.mts), so the machine's zone can't make these pass.
const tokyo = (iso: string) => new Date(`${iso}+09:00`)

describe('isQuietHours (23:00–07:00 JST)', () => {
  it.each([
    ['2026-10-05T22:59:59', false],
    ['2026-10-05T23:00:00', true],
    ['2026-10-05T23:59:59', true],
    ['2026-10-06T00:00:00', true],
    ['2026-10-06T06:59:59', true],
    ['2026-10-06T07:00:00', false],
    ['2026-10-06T12:00:00', false],
  ])('%s Tokyo → %s', (time, quiet) => {
    expect(isQuietHours(tokyo(time))).toBe(quiet)
  })

  it('stays quiet across midnight (Monday 23:30 to Tuesday 00:30)', () => {
    expect(isQuietHours(tokyo('2026-10-05T23:30:00'))).toBe(true)
    expect(isQuietHours(tokyo('2026-10-06T00:30:00'))).toBe(true)
  })

  it('uses Tokyo, not UTC: 14:00 UTC is 23:00 in Tokyo', () => {
    expect(isQuietHours(new Date('2026-10-05T14:00:00Z'))).toBe(true)
    expect(isQuietHours(new Date('2026-10-05T13:59:59Z'))).toBe(false)
  })
})
