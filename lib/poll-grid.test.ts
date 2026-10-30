import { describe, expect, it } from 'vitest'
import { gridTimes, isPastSlot, mondayOf, slotKey, sortedKeys, splitSlotKey, weekBounds, weekDays } from './poll-grid'

describe('poll grid', () => {
  it('finds the Monday of a Tokyo week', () => {
    expect(mondayOf('2026-10-30')).toBe('2026-10-26') // a Friday
    expect(mondayOf('2026-10-26')).toBe('2026-10-26')
    expect(mondayOf('2026-11-01')).toBe('2026-10-26') // a Sunday
  })

  it('lists the seven days from Monday', () => {
    expect(weekDays('2026-10-26')).toEqual([
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
    ])
  })

  it('makes hourly and half-hourly rows from 8:00 to 21:xx', () => {
    expect(gridTimes(60)).toHaveLength(14)
    expect(gridTimes(60)[0]).toBe('08:00')
    expect(gridTimes(60).at(-1)).toBe('21:00')
    expect(gridTimes(30)).toHaveLength(28)
    expect(gridTimes(30).at(-1)).toBe('21:30')
  })

  it('round-trips keys and sorts them in time order', () => {
    const key = slotKey('2026-10-27', '16:00')
    expect(splitSlotKey(key)).toEqual({ date: '2026-10-27', time: '16:00' })
    expect(sortedKeys(['2026-10-28T09:00', '2026-10-27T16:00', '2026-10-27T09:30'])).toEqual([
      '2026-10-27T09:30', '2026-10-27T16:00', '2026-10-28T09:00',
    ])
  })

  it('treats a slot at or before now (Tokyo) as past', () => {
    const now = new Date('2026-10-30T07:00:00Z') // 16:00 JST
    expect(isPastSlot('2026-10-30T16:00', now)).toBe(true)
    expect(isPastSlot('2026-10-30T16:30', now)).toBe(false)
    expect(isPastSlot('2026-02-31T10:00', now)).toBe(true) // not a real day
  })

  it('allows this week up to 12 weeks ahead', () => {
    expect(weekBounds(new Date('2026-10-30T07:00:00Z'))).toEqual({ first: '2026-10-26', last: '2027-01-18' })
  })
})
