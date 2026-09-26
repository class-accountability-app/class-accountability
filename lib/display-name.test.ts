import { describe, expect, it } from 'vitest'
import { DISPLAY_NAME_MAX, graphemeCount, normalizeDisplayName } from './display-name'

describe('graphemeCount', () => {
  it.each([
    ['あき', 2],
    ['23b1808', 7],
    ['👍🏽', 1], // thumbs up + skin tone: 2 code points
    ['👨‍👩‍👧', 1], // family, joined with ZWJ: 5 code points
    ['🇯🇵', 1], // flag: 2 regional indicators
    ['が', 1], // か + combining dakuten
  ])('counts %s as %i', (text, expected) => {
    expect(graphemeCount(text)).toBe(expected)
  })
})

describe('normalizeDisplayName', () => {
  it('trims ordinary and full-width spaces', () => {
    expect(normalizeDisplayName('  あき　')).toEqual({ value: 'あき', error: null })
  })

  it('stores combining marks precomposed (NFC)', () => {
    expect(normalizeDisplayName('が')).toEqual({ value: 'が', error: null })
  })

  it.each([
    ['nothing', undefined],
    ['an empty string', ''],
    ['only spaces', '   '],
    ['only full-width spaces', '　　'],
  ])('asks for a name when given %s', (_label, raw) => {
    expect(normalizeDisplayName(raw).error).toBe('displayNameRequired')
  })

  it('accepts exactly 20 characters, even when they are long in code points', () => {
    const twentyEmoji = '👍🏽'.repeat(DISPLAY_NAME_MAX)
    expect(twentyEmoji.length).toBeGreaterThan(DISPLAY_NAME_MAX)
    expect(normalizeDisplayName(twentyEmoji).error).toBeNull()
    expect(normalizeDisplayName('あ'.repeat(DISPLAY_NAME_MAX)).error).toBeNull()
  })

  it('rejects 21 characters', () => {
    expect(normalizeDisplayName('あ'.repeat(DISPLAY_NAME_MAX + 1)).error).toBe('displayNameTooLong')
  })

  it('stays within the database backstop of 80 code points', () => {
    // The worst common case: 20 characters of 4 code points each.
    const heavy = '👍🏽'.repeat(DISPLAY_NAME_MAX)
    expect([...heavy].length).toBeLessThanOrEqual(80)
  })

  it('rejects control characters inside the name', () => {
    expect(normalizeDisplayName('あ\nき').error).toBe('displayNameInvalid')
    expect(normalizeDisplayName('a\tb').error).toBe('displayNameInvalid')
  })
})
