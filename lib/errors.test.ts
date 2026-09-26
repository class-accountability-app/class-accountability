import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DB_CODES,
  codeErrorKeyFor,
  confirmOutcomeFor,
  errorKeyFor,
  loginErrorKeyFor,
  redactEmails,
  resendErrorKeyFor,
  toErrorKey,
} from './errors'
import ja from '@/messages/ja.json'
import en from '@/messages/en.json'

function captureLog() {
  return vi.spyOn(console, 'error').mockImplementation(() => {})
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('signup email-domain trigger', () => {
  const triggerError = {
    code: '23514',
    message: 'Signup is limited to andrew.ac.jp email addresses.',
  }
  // What the browser actually receives from signInWithOtp when the trigger fires.
  const authWrappedError = {
    code: 'unexpected_failure',
    message: 'Database error saving new user',
    status: 500,
  }

  it('maps the raw trigger exception to the domain message', () => {
    expect(errorKeyFor(triggerError)).toBe('emailDomain')
    expect(ja.errors.emailDomain).toContain('@andrew.ac.jp')
    expect(en.errors.emailDomain).toContain('@andrew.ac.jp')
  })

  it('maps the Supabase Auth wrapper of that trigger error the same way', () => {
    expect(errorKeyFor(authWrappedError)).toBe('emailDomain')
  })

  it('maps the same way on the server, and logs code + message there', () => {
    const log = captureLog()
    expect(toErrorKey('someAction', triggerError)).toBe('emailDomain')
    expect(log).toHaveBeenCalledWith(
      '[someAction] code=23514 message=Signup is limited to andrew.ac.jp email addresses.'
    )
  })
})

describe('loginErrorKeyFor (signInWithOtp in the browser)', () => {
  // supabase-js reports the trigger's HTTP 500 like this, body unread.
  const retryable500 = { name: 'AuthRetryableFetchError', message: '{}', status: 500 }

  it('reads a 500 for a non-university address as the domain-trigger error', () => {
    expect(loginErrorKeyFor(retryable500, 'taro@gmail.com')).toBe('emailDomain')
    expect(loginErrorKeyFor(retryable500, ' Taro@Example.COM ')).toBe('emailDomain')
  })

  it('keeps a 500 for a university address generic (a real outage)', () => {
    expect(loginErrorKeyFor(retryable500, '23b0000@andrew.ac.jp')).toBe('generic')
    expect(loginErrorKeyFor(retryable500, '23B0000@ANDREW.AC.JP')).toBe('generic')
  })

  it('does not treat look-alike domains as the university', () => {
    expect(loginErrorKeyFor(retryable500, 'x@andrew.ac.jp.evil.com')).toBe('emailDomain')
    expect(loginErrorKeyFor(retryable500, 'x@notandrew.ac.jp')).toBe('emailDomain')
  })

  it('still maps rate limits and other known errors normally', () => {
    expect(loginErrorKeyFor({ message: 'Too many requests', status: 429 }, 'taro@gmail.com')).toBe(
      'rateLimited'
    )
    expect(loginErrorKeyFor({ code: 'email_address_invalid', message: 'x', status: 400 }, 'a@b')).toBe(
      'emailInvalid'
    )
  })

  it('maps the trigger message itself if Supabase ever passes it through', () => {
    expect(
      loginErrorKeyFor(
        { code: '23514', message: 'Signup is limited to andrew.ac.jp email addresses.', status: 500 },
        'taro@gmail.com'
      )
    ).toBe('emailDomain')
  })
})

describe('errorKeyFor (client login)', () => {
  it('never logs', () => {
    const log = captureLog()
    errorKeyFor({ code: 'XX000', message: 'internal error' })
    expect(log).not.toHaveBeenCalled()
  })

  it('maps rate limits by code or by a bare 429', () => {
    expect(errorKeyFor({ code: 'over_email_send_rate_limit', message: 'x' })).toBe('rateLimited')
    expect(errorKeyFor({ message: 'Too many requests', status: 429 })).toBe('rateLimited')
  })

  it('maps anything else to the generic message', () => {
    expect(errorKeyFor({ code: 'unexpected_failure', message: 'Something broke', status: 500 })).toBe(
      'generic'
    )
  })
})

// What Supabase returns for a wrong code and for an expired one: the same.
const otpExpired = { code: 'otp_expired', message: 'Token has expired or is invalid', status: 403 }

describe('codeErrorKeyFor (verifyOtp with the 6-digit code)', () => {
  it('maps a wrong or expired code to one message', () => {
    expect(codeErrorKeyFor(otpExpired)).toBe('codeInvalid')
  })

  it('maps too many attempts to the rate-limit message', () => {
    expect(codeErrorKeyFor({ code: 'over_request_rate_limit', message: 'x', status: 429 })).toBe(
      'rateLimited'
    )
  })

  it('keeps an outage generic', () => {
    expect(codeErrorKeyFor({ message: '{}', status: 500 })).toBe('generic')
  })
})

describe('resendErrorKeyFor', () => {
  it('maps the per-address email limit to "wait before resending"', () => {
    expect(
      resendErrorKeyFor({ code: 'over_email_send_rate_limit', message: 'x', status: 429 }, 'a@andrew.ac.jp')
    ).toBe('resendTooSoon')
  })

  it('maps other errors like the first send', () => {
    expect(resendErrorKeyFor({ message: '{}', status: 500 }, 'taro@gmail.com')).toBe('emailDomain')
    expect(resendErrorKeyFor({ message: 'x', status: 429 }, 'a@andrew.ac.jp')).toBe('rateLimited')
  })
})

describe('confirmOutcomeFor (the email button)', () => {
  it('shows the expired screen for a used, expired or bogus token', () => {
    expect(confirmOutcomeFor(otpExpired)).toBe('expired')
    expect(confirmOutcomeFor({ code: 'validation_failed', message: 'x', status: 400 })).toBe('expired')
  })

  it('keeps the button for a rate limit', () => {
    expect(confirmOutcomeFor({ code: 'over_request_rate_limit', message: 'x', status: 429 })).toBe(
      'rateLimited'
    )
  })

  it('keeps the button for a network failure or an outage', () => {
    expect(confirmOutcomeFor({ message: 'Failed to fetch', status: 0 })).toBe('generic')
    expect(confirmOutcomeFor({ message: '{}', status: 503 })).toBe('generic')
    expect(confirmOutcomeFor({ message: 'no status' })).toBe('generic')
  })
})

describe('toErrorKey', () => {
  it('never logs an email address', () => {
    const log = captureLog()
    const key = toErrorKey('someAction', {
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

  it('maps the nudge-limit trigger when the call site asks for it', () => {
    captureLog()
    const triggerError = {
      code: DB_CODES.nudgeLimit,
      message: 'Nudge limit reached: 3 per recipient per 24 hours.',
    }
    expect(toErrorKey('sendNudge', triggerError, { [DB_CODES.nudgeLimit]: 'nudgeLimit' })).toBe(
      'nudgeLimit'
    )
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
