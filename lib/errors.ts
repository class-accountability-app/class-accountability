import type messages from '@/messages/ja.json'

// Server actions return one of these keys, never a raw message. The client
// looks the key up in messages/*.json under "errors".
export type ErrorKey = keyof (typeof messages)['errors']

export type ActionResult = { error: ErrorKey | null }

type RawError = { code?: string; message?: string; status?: number } | null | undefined

const PG_UNIQUE_VIOLATION = '23505'
const PG_FOREIGN_KEY_VIOLATION = '23503'
const PG_INSUFFICIENT_PRIVILEGE = '42501'
// Raised by the enforce_nudge_limit trigger (0011_display_name_and_nudge_limit.sql).
const NUDGE_LIMIT = 'SP001'

export const DB_CODES = {
  uniqueViolation: PG_UNIQUE_VIOLATION,
  foreignKeyViolation: PG_FOREIGN_KEY_VIOLATION,
  nudgeLimit: NUDGE_LIMIT,
} as const

const EMAIL_PATTERN = /[^\s"'<>(),;:]+@[^\s"'<>(),;:]+/g

// Some auth errors echo the address back ("Email address "x@y" is invalid").
// Logs keep the code and message for debugging but never the address.
export function redactEmails(text: string): string {
  return text.replace(EMAIL_PATTERN, '[email]')
}

export function logServerError(context: string, error: RawError): void {
  console.error(
    `[${context}] code=${error?.code ?? 'none'} message=${redactEmails(error?.message ?? 'none')}`
  )
}

// The signup trigger (0002_email_domain.sql) raises "Signup is limited to
// andrew.ac.jp email addresses." Supabase Auth usually swallows that and
// reports "Database error saving new user" instead; the domain trigger is the
// only thing in signup that is expected to fail, so both mean "wrong domain".
export function isEmailDomainError(error: RawError): boolean {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('signup is limited to') || message.includes('database error saving new user')
}

const RATE_LIMIT_CODES = new Set([
  'over_email_send_rate_limit',
  'over_request_rate_limit',
  'over_sms_send_rate_limit',
])

// The friendly message key for an error. Pure, so the browser can use it too
// (login calls Supabase Auth from the client; Supabase's auth logs keep the
// raw error there). `byCode` lets a call site give a code a specific meaning
// in context (e.g. a unique violation on class_memberships = "already joined").
export function errorKeyFor(
  error: RawError,
  byCode: Partial<Record<string, ErrorKey>> = {}
): ErrorKey {
  const code = error?.code
  if (code && byCode[code]) return byCode[code]
  if (isEmailDomainError(error)) return 'emailDomain'
  if (code === 'email_address_invalid') return 'emailInvalid'
  if ((code && RATE_LIMIT_CODES.has(code)) || error?.status === 429) return 'rateLimited'
  if (code === PG_INSUFFICIENT_PRIVILEGE) return 'notAllowed'
  return 'generic'
}

// Mirrors allowed_domain in the signup trigger (0007_remove_dev_email_whitelist.sql).
export const UNIVERSITY_EMAIL_DOMAIN = 'andrew.ac.jp'

// supabase-js turns every HTTP 500 from Auth into an AuthRetryableFetchError
// without reading the body, so in the browser the trigger's message never
// arrives. The trigger is the only expected 500 and fires only for other
// domains, so a 500 for a non-university address means "wrong domain". We
// only interpret a failure here; we never block an address before sending,
// so an older account on another domain can still sign in.
export function loginErrorKeyFor(error: RawError, email: string): ErrorKey {
  const key = errorKeyFor(error)
  const domain = email.trim().toLowerCase().split('@').pop()
  if (key === 'generic' && error?.status === 500 && domain !== UNIVERSITY_EMAIL_DOMAIN) {
    return 'emailDomain'
  }
  return key
}

// verifyOtp with the 6-digit code. Supabase answers a wrong code and an
// expired one with the same otp_expired ("Token has expired or is invalid"),
// so the two share one message that covers both.
export function codeErrorKeyFor(error: RawError): ErrorKey {
  if (error?.code === 'otp_expired') return 'codeInvalid'
  return errorKeyFor(error)
}

// Resending the code. Supabase lets one address request an email once every
// 60 seconds; the countdown normally prevents that, so hitting it is rare.
export function resendErrorKeyFor(error: RawError, email: string): ErrorKey {
  if (error?.code === 'over_email_send_rate_limit') return 'resendTooSoon'
  return loginErrorKeyFor(error, email)
}

// The email button (/auth/confirm). "expired" shows screen 15: the token is
// past its hour, already used (by the code or the button, they share one
// token) or not a token at all. A rate limit, a network failure (status 0) or
// a Supabase outage (5xx) keeps screen 14 with a message, so pressing again
// can still work.
export function confirmOutcomeFor(error: RawError): 'expired' | ErrorKey {
  const key = errorKeyFor(error)
  if (key === 'rateLimited') return key
  const status = error?.status ?? 0
  if (status === 0 || status >= 500) return 'generic'
  return 'expired'
}

// Server actions: log the raw error (code + message) for Vercel, then map it.
export function toErrorKey(
  context: string,
  error: RawError,
  byCode: Partial<Record<string, ErrorKey>> = {}
): ErrorKey {
  logServerError(context, error)
  return errorKeyFor(error, byCode)
}
