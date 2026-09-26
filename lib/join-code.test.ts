import { describe, expect, it } from 'vitest'
import { normalizeJoinCode } from './join-code'

describe('normalizeJoinCode', () => {
  it.each([
    ['K7M3Q9TX', 'K7M3Q9TX'],
    ['k7m3q9tx', 'K7M3Q9TX'],
    [' K7M3 Q9TX ', 'K7M3Q9TX'],
    ['k7m3-q9tx', 'K7M3Q9TX'],
    ['ｋ７ｍ３－Ｑ９ＴＸ', 'K7M3Q9TX'], // full-width, from a Japanese keyboard
    ['K7M3　Q9TX', 'K7M3Q9TX'], // ideographic space
  ])('%s → %s', (input, code) => {
    expect(normalizeJoinCode(input)).toBe(code)
  })

  it('takes the code out of a pasted link', () => {
    expect(normalizeJoinCode('https://www.study-pods.org/join/K7M3Q9TX')).toBe('K7M3Q9TX')
    expect(normalizeJoinCode('study-pods.org/join/k7m3q9tx?utm=x')).toBe('K7M3Q9TX')
  })

  it.each([
    [''],
    ['K7M3Q9T'], // 7 characters
    ['K7M3Q9TXY'], // 9 characters
    ['K7M3Q9T0'], // 0 is not in the alphabet
    ['K7M3Q9TO'], // nor O
    ['K7M3Q9T1'], // nor 1
    ['<script>'],
    ['https://www.study-pods.org/join/%E0'], // malformed escape
  ])('rejects %j', (input) => {
    expect(normalizeJoinCode(input)).toBeNull()
  })
})
