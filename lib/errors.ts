import type messages from '@/messages/ja.json'

// Server actions return one of these keys, never a raw message. The client
// looks the key up in messages/*.json under "errors".
export type ErrorKey = keyof (typeof messages)['errors']

export type ActionResult = { error: ErrorKey | null }

type RawError = { code?: string; message?: string } | null | undefined

const PG_UNIQUE_VIOLATION = '23505'
const PG_FOREIGN_KEY_VIOLATION = '23503'
const PG_INSUFFICIENT_PRIVILEGE = '42501'

export const DB_CODES = {
  uniqueViolation: PG_UNIQUE_VIOLATION,
  foreignKeyViolation: PG_FOREIGN_KEY_VIOLATION,
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

// Logs the raw error server-side, then returns the friendly message key.
// `byCode` lets a call site give a specific meaning to a code in context
// (e.g. a unique violation on class_memberships means "already joined").
export function toErrorKey(
  context: string,
  error: RawError,
  byCode: Partial<Record<string, ErrorKey>> = {}
): ErrorKey {
  logServerError(context, error)

  const code = error?.code
  if (code && byCode[code]) return byCode[code]
  if (isEmailDomainError(error)) return 'emailDomain'
  if (code === 'email_address_invalid') return 'emailInvalid'
  if (code && RATE_LIMIT_CODES.has(code)) return 'rateLimited'
  if (code === PG_INSUFFICIENT_PRIVILEGE) return 'notAllowed'
  return 'generic'
}
