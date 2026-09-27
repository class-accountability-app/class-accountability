import { describe, expect, it } from 'vitest'
import { CHIPS, addChip, parseAmount, percentOf, tidyTotal } from './quick-log'

describe('parseAmount', () => {
  it.each([
    ['540', 'character_count', 540],
    ['５４０', 'character_count', 540],
    ['1,240', 'character_count', 1240],
    [' 300 ', 'word_count', 300],
    ['1.5', 'study_hours', 1.5],
    ['１．５', 'study_hours', 1.5],
    ['.5', 'study_hours', 0.5],
    ['2', 'study_hours', 2],
  ] as const)('%s (%s) is %s', (raw, type, expected) => {
    expect(parseAmount(raw, type)).toBe(expected)
  })

  it.each([
    ['', 'character_count'],
    ['0', 'character_count'],
    ['-5', 'character_count'],
    ['1.5', 'character_count'],
    ['abc', 'word_count'],
    ['0', 'study_hours'],
    ['1.255', 'study_hours'],
    ['1e3', 'character_count'],
  ] as const)('%s (%s) is rejected', (raw, type) => {
    expect(parseAmount(raw, type)).toBeNull()
  })
})

describe('addChip', () => {
  it('adds to the field, treating empty as 0', () => {
    expect(addChip('', 300, 'character_count')).toBe('300')
    expect(addChip('540', 100, 'character_count')).toBe('640')
    expect(addChip('abc', 50, 'word_count')).toBe('50')
  })

  it('keeps hours free of floating-point noise', () => {
    expect(addChip('0.1', 0.5, 'study_hours')).toBe('0.6')
    expect(addChip('1.5', 0.5, 'study_hours')).toBe('2')
  })

  it('has three chips per amount type', () => {
    for (const chips of Object.values(CHIPS)) expect(chips).toHaveLength(3)
  })
})

describe('percentOf and tidyTotal', () => {
  it('rounds the percent down', () => {
    expect(percentOf(1240, 2000)).toBe(62)
    expect(percentOf(1999, 2000)).toBe(99)
    expect(percentOf(2400, 2000)).toBe(120)
    expect(percentOf(5, 0)).toBe(0)
  })

  it('tidies summed decimals', () => {
    expect(tidyTotal(0.1 + 0.2)).toBe(0.3)
  })
})
