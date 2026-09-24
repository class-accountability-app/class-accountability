import type { EmailOtpType } from '@supabase/supabase-js'

// Supabase's "Email OTP length" must be set to 6 in the dashboard to match.
export const CODE_LENGTH = 6

// Supabase lets one address request a new email once every 60 seconds.
export const RESEND_SECONDS = 60

// What a student types or pastes, reduced to the digits of the code.
// NFKC turns full-width digits from a Japanese keyboard (１２３) into 123;
// everything else (spaces, dashes, "コード:") is dropped. Longer input is cut
// to the code length, so pasting "123 456" still works.
export function normalizeCode(input: string): string {
  return input.normalize('NFKC').replace(/\D/g, '').slice(0, CODE_LENGTH)
}

export function isCompleteCode(code: string): boolean {
  return new RegExp(`^[0-9]{${CODE_LENGTH}}$`).test(code)
}

// Seconds until the resend link is allowed again.
export function secondsUntilResend(sentAt: number, now: number): number {
  const elapsed = Math.floor((now - sentAt) / 1000)
  return Math.max(0, RESEND_SECONDS - elapsed)
}

// The login in progress, kept in sessionStorage (this tab only) so the code
// screen survives a phone reloading the tab after a trip to the mail app.
// Never in the URL, which would put the address in history and server logs.
export type LoginAttempt = { email: string; sentAt: number; next: string }

const STORAGE_KEY = 'study-pods:login-attempt'

export function parseLoginAttempt(raw: string | null): LoginAttempt | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as LoginAttempt).email === 'string' &&
      typeof (value as LoginAttempt).sentAt === 'number' &&
      typeof (value as LoginAttempt).next === 'string'
    ) {
      return value as LoginAttempt
    }
  } catch {
    // Not ours or corrupted: start over.
  }
  return null
}

// Supabase's "Email OTP expiration", set to 3600 seconds in the dashboard.
const CODE_LIFETIME_MS = 60 * 60 * 1000

// Storage can throw (private mode, blocked site data); the page still works,
// it just won't survive a reload. An attempt older than the code's lifetime
// is dropped: its code can't work any more.
export function loadLoginAttempt(): LoginAttempt | null {
  try {
    const attempt = parseLoginAttempt(window.sessionStorage.getItem(STORAGE_KEY))
    if (attempt && Date.now() - attempt.sentAt < CODE_LIFETIME_MS) return attempt
    return null
  } catch {
    return null
  }
}

export function saveLoginAttempt(attempt: LoginAttempt): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attempt))
  } catch {}
}

export function clearLoginAttempt(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {}
}

// The `type` on the email button's link. Both templates send "email", which
// Supabase accepts for new users (Confirm signup) and returning ones (Magic
// Link). The older names are accepted too; anything else is not a login link.
const CONFIRM_TYPES = ['email', 'magiclink', 'signup'] as const satisfies readonly EmailOtpType[]
type ConfirmType = (typeof CONFIRM_TYPES)[number]

export function confirmTypeFrom(raw: string | null): ConfirmType | null {
  if (raw === null) return 'email'
  return (CONFIRM_TYPES as readonly string[]).includes(raw) ? (raw as ConfirmType) : null
}
