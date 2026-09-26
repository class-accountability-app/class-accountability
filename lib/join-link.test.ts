import { describe, expect, it } from 'vitest'
import { groupedCode, joinUrl, parseOrigin, shortJoinUrl } from './join-link'

describe('parseOrigin', () => {
  it('keeps only the scheme and host', () => {
    expect(parseOrigin('https://www.study-pods.org')).toBe('https://www.study-pods.org')
    expect(parseOrigin('https://www.study-pods.org/')).toBe('https://www.study-pods.org')
    expect(parseOrigin(' https://www.study-pods.org/some/path ')).toBe('https://www.study-pods.org')
    expect(parseOrigin('http://localhost:3000')).toBe('http://localhost:3000')
  })

  it('ignores anything that is not an http(s) URL', () => {
    expect(parseOrigin(undefined)).toBeNull()
    expect(parseOrigin('')).toBeNull()
    expect(parseOrigin('www.study-pods.org')).toBeNull()
    expect(parseOrigin('javascript:alert(1)')).toBeNull()
  })
})

describe('joinUrl', () => {
  it('is the full https link (what the QR code encodes)', () => {
    expect(joinUrl('https://www.study-pods.org', 'K7M3Q9TX')).toBe(
      'https://www.study-pods.org/join/K7M3Q9TX'
    )
  })
})

describe('shortJoinUrl', () => {
  it('drops the scheme and www for reading off a screen', () => {
    expect(shortJoinUrl('https://www.study-pods.org/join/K7M3Q9TX')).toBe(
      'study-pods.org/join/K7M3Q9TX'
    )
  })

  it('keeps other hosts as they are', () => {
    expect(shortJoinUrl('http://localhost:3000/join/K7M3Q9TX')).toBe('localhost:3000/join/K7M3Q9TX')
  })
})

describe('groupedCode', () => {
  it('splits an 8-character code in two', () => {
    expect(groupedCode('K7M3Q9TX')).toBe('K7M3 Q9TX')
    expect(groupedCode('ABC')).toBe('ABC')
  })
})
