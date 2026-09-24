import { describe, expect, it } from 'vitest'
import {
  confirmTypeFrom,
  isCompleteCode,
  normalizeCode,
  parseLoginAttempt,
  secondsUntilResend,
} from './login-code'

describe('normalizeCode', () => {
  it.each([
    ['123456', '123456'],
    ['123 456', '123456'],
    [' 123456 ', '123456'],
    ['123-456', '123456'],
    ['１２３４５６', '123456'],
    ['１２３ ４５６', '123456'],
    ['コード: 123456', '123456'],
    ['1234567', '123456'],
    ['12a34', '1234'],
    ['', ''],
  ])('turns %j into %j', (input, expected) => {
    expect(normalizeCode(input)).toBe(expected)
  })
})

describe('isCompleteCode', () => {
  it('accepts exactly six digits', () => {
    expect(isCompleteCode('012345')).toBe(true)
  })

  it.each(['12345', '1234567', '12345a', '', '１２３４５６'])('rejects %j', (code) => {
    expect(isCompleteCode(code)).toBe(false)
  })
})

describe('secondsUntilResend', () => {
  const sentAt = 1_000_000

  it('starts at 60', () => {
    expect(secondsUntilResend(sentAt, sentAt)).toBe(60)
  })

  it('counts down in whole seconds', () => {
    expect(secondsUntilResend(sentAt, sentAt + 18_500)).toBe(42)
  })

  it('stops at 0', () => {
    expect(secondsUntilResend(sentAt, sentAt + 60_000)).toBe(0)
    expect(secondsUntilResend(sentAt, sentAt + 600_000)).toBe(0)
  })
})

describe('parseLoginAttempt', () => {
  it('reads a saved attempt', () => {
    const attempt = { email: 'a@andrew.ac.jp', sentAt: 1, next: '/' }
    expect(parseLoginAttempt(JSON.stringify(attempt))).toEqual(attempt)
  })

  it.each([null, '', 'not json', '{}', '{"email":"a@andrew.ac.jp","sentAt":"1","next":"/"}'])(
    'ignores %j',
    (raw) => {
      expect(parseLoginAttempt(raw)).toBeNull()
    }
  )
})

describe('confirmTypeFrom', () => {
  it('defaults to email when the link has no type', () => {
    expect(confirmTypeFrom(null)).toBe('email')
  })

  it.each(['email', 'magiclink', 'signup'] as const)('accepts %s', (type) => {
    expect(confirmTypeFrom(type)).toBe(type)
  })

  it.each(['recovery', 'invite', 'email_change', ''])('rejects %j', (type) => {
    expect(confirmTypeFrom(type)).toBeNull()
  })
})
