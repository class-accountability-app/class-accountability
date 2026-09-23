import { afterEach, describe, expect, it, vi } from 'vitest'
import { DB_CODES, redactEmails, toErrorKey } from './errors'
import ja from '@/messages/ja.json'
import en from '@/messages/en.json'

function captureLog() {
  return vi.spyOn(console, 'error').mockImplementation(() => {})
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('signup email-domain trigger', () => {
  it('maps the raw trigger exception to the domain message', () => {
    const log = captureLog()
    const key = toErrorKey('requestLoginLink', {
      code: '23514',
      message: 'Signup is limited to andrew.ac.jp email addresses.',
    })
    expect(key).toBe('emailDomain')
    expect(ja.errors[key]).toContain('@andrew.ac.jp')
    expect(en.errors[key]).toContain('@andrew.ac.jp')
    expect(log).toHaveBeenCalledWith(
      '[requestLoginLink] code=23514 message=Signup is limited to andrew.ac.jp email addresses.'
    )
  })

  it('maps the Supabase Auth wrapper of that trigger error the same way', () => {
    captureLog()
    expect(
      toErrorKey('requestLoginLink', {
        code: 'unexpected_failure',
        message: 'Database error saving new user',
      })
    ).toBe('emailDomain')
  })
})

describe('toErrorKey', () => {
  it('never logs an email address', () => {
    const log = captureLog()
    const key = toErrorKey('requestLoginLink', {
      code: 'email_address_invalid',
      message: 'Email address "taro.yamada@gmail.com" is invalid',
    })
    expect(key).toBe('emailInvalid')
    const logged = log.mock.calls.flat().join(' ')
    expect(logged).not.toContain('taro.yamada@gmail.com')
    expect(logged).toContain('code=email_address_invalid')
  })

  it('lets the call site give a code a specific meaning', () => {
    captureLog()
    expect(
      toErrorKey('joinClass', { code: DB_CODES.uniqueViolation, message: 'duplicate key' }, {
        [DB_CODES.uniqueViolation]: 'alreadyJoinedClass',
      })
    ).toBe('alreadyJoinedClass')
  })

  it('maps RLS denials and rate limits', () => {
    captureLog()
    expect(toErrorKey('x', { code: '42501', message: 'new row violates row-level security policy' })).toBe(
      'notAllowed'
    )
    expect(toErrorKey('x', { code: 'over_email_send_rate_limit', message: 'rate limited' })).toBe(
      'rateLimited'
    )
  })

  it('falls back to a generic message for anything unrecognised, including null', () => {
    captureLog()
    expect(toErrorKey('x', { code: 'XX000', message: 'internal error' })).toBe('generic')
    expect(toErrorKey('x', null)).toBe('generic')
  })
})

describe('redactEmails', () => {
  it('replaces every address', () => {
    expect(redactEmails('a@b.jp and "c.d@andrew.ac.jp"')).toBe('[email] and "[email]"')
  })
})
